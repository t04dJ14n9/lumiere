import { StateField } from "@codemirror/state";
import type { EditorState, Extension, Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import {
  LINES_ONLY,
  alignBlocks,
  rowMarkdown,
  splitBlocks,
  tokens,
  wordDiff,
} from "../../shared/diff";
import type { Block, WordBudget } from "../../shared/diff";
import {
  adoptPass,
  endLifetime,
  newLifetime,
} from "../../shared/render-lifetime";
import type { PassLifetime, PassOwner } from "../../shared/render-lifetime";
import type { DocHunk, GitDiff, HunkSet } from "../gitGutter/api";
import type { RenderService } from "../render/api";
import { currentHunk, lineMarks } from "./open";

export interface InlineActions {
  readonly diff: GitDiff;
  readonly render: RenderService;
  /** The plugin's render work, drained when it is turned off. */
  readonly owner?: PassOwner;
}

/**
 * Word diffs past these token counts (one hunk, one rebuild) fall back to the
 * line-level view: tinted lines and the old text as a ghost above.
 */
export const HUNK_TOKENS = 1500;
export const REBUILD_TOKENS = 12_000;
/** The same limits in characters, for few very long tokens. */
export const HUNK_CHARS = 20_000;
export const REBUILD_CHARS = 200_000;

/** Removed words, struck through where they were. Read-only and not copied. */
class RemovedText extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  override eq(other: RemovedText): boolean {
    return other.text === this.text;
  }
  override toDOM(): HTMLElement {
    const element = document.createElement("del");
    element.className = "mw-gd-del mw-gi-removed";
    element.textContent = this.text.replace(/\n/g, " ⏎ ");
    element.setAttribute("aria-label", `removed: ${this.text}`);
    return element;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

type GhostKind = "removed" | "before" | "added";

interface GhostModel {
  readonly hunk: DocHunk;
  readonly markdown: string;
  readonly kind: GhostKind;
  /** The baseline label when the ghost was built; a refresh rebuilds it. */
  readonly label: string;
}

const CAPTIONS: Record<GhostKind, string> = {
  removed: "Removed",
  before: "Before",
  added: "Added",
};

const lifetimes = new WeakMap<HTMLElement, PassLifetime>();
const signals = new WeakMap<PassLifetime, AbortSignal>();

/** A block's other version, rendered, with Restore: removed, before, or added. */
class GhostBlock extends WidgetType {
  constructor(
    readonly model: GhostModel,
    private readonly actions: InlineActions,
  ) {
    super();
  }
  override eq(other: GhostBlock): boolean {
    const a = this.model;
    const b = other.model;
    return (
      a.markdown === b.markdown &&
      a.kind === b.kind &&
      a.label === b.label &&
      a.hunk.kind === b.hunk.kind &&
      a.hunk.old === b.hunk.old &&
      a.hunk.oldLine === b.hunk.oldLine &&
      a.hunk.from === b.hunk.from &&
      a.hunk.to === b.hunk.to
    );
  }
  override toDOM(view: EditorView): HTMLElement {
    const { hunk, kind, label } = this.model;
    const root = document.createElement("div");
    root.className = `mw-gi-ghost is-${kind}`;
    const caption = root.appendChild(document.createElement("div"));
    caption.className = "mw-gi-caption";
    const where =
      kind === "added"
        ? `line ${view.state.doc.lineAt(hunk.from).number}`
        : `line ${hunk.oldLine} in ${label}`;
    caption.appendChild(document.createElement("span")).textContent =
      `${CAPTIONS[kind]} · ${where}`;
    const restore = caption.appendChild(document.createElement("button"));
    restore.type = "button";
    restore.className = "mw-gi-restore";
    restore.textContent = "Restore";
    restore.title = "Put the baseline text back";
    restore.addEventListener("mousedown", (event) => event.preventDefault());
    restore.addEventListener("click", (event) => {
      event.preventDefault();
      if (restore.disabled) {
        return;
      }
      // The service resolves the hunk against a fresh diff and publishes the
      // result at once, so a second click finds nothing left to restore.
      restore.disabled = true;
      // The widget's hunk has the offsets it was built with; the gutter's
      // field has them mapped through every edit since. Act on that one.
      const current = currentHunk(view.state, this.actions.diff, hunk);
      if (current) {
        this.actions.diff.revert(current);
      }
    });
    const content = root.appendChild(document.createElement("div"));
    content.className = "mw-gi-ghost-body";
    const abort = new AbortController();
    const lifetime = newLifetime(this.actions.owner, () => abort.abort());
    signals.set(lifetime, abort.signal);
    lifetimes.set(root, lifetime);
    this.render(view, content, lifetime);
    return root;
  }
  private render(
    view: EditorView,
    content: HTMLElement,
    lifetime: PassLifetime,
  ): void {
    const { markdown } = this.model;
    const pending = this.actions.render.into(content, markdown, {
      signal: signals.get(lifetime)!,
      readOnly: true,
      measure: () => {
        if (lifetime.live) {
          view.requestMeasure();
        }
      },
    });
    void adoptPass(lifetime, pending)
      .then((kept) => {
        if (kept && lifetime.live) {
          view.requestMeasure();
        }
      })
      .catch(() => {
        if (lifetime.live) {
          content.textContent = markdown;
        }
      });
  }
  override destroy(dom: HTMLElement): void {
    const lifetime = lifetimes.get(dom);
    if (lifetime) {
      endLifetime(lifetime);
    }
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

/** Blocks the live editor renders as one widget, where source marks would not show. */
const RENDERED: ReadonlySet<Block["kind"]> = new Set([
  "table",
  "code",
  "math",
  "frontmatter",
]);

/** Whether a modified hunk touches a rendered block, in the baseline or now. */
export function touchesRenderedBlock(
  hunk: DocHunk,
  blocks: readonly Block[],
  state: EditorState,
): boolean {
  const first = state.doc.lineAt(hunk.from).number - 1;
  const last = state.doc.lineAt(hunk.to).number;
  const now = blocks.some(
    (block) =>
      RENDERED.has(block.kind) && block.from < last && block.to > first,
  );
  return now || splitBlocks(hunk.old).some((block) => RENDERED.has(block.kind));
}

/**
 * The rendered block removed lines sat inside, when it is still there; rows
 * removed from the end of a table still belong to it.
 */
function removedInsideBlock(
  hunk: DocHunk,
  blocks: readonly Block[],
  state: EditorState,
): { block: Block; tail: boolean } | undefined {
  if (hunk.atEnd) {
    return undefined;
  }
  const at = state.doc.lineAt(hunk.from).number - 1;
  const rows = hunk.old
    .split("\n")
    .every((line) => line.trimStart().startsWith("|"));
  for (const block of blocks) {
    if (!RENDERED.has(block.kind) || block.from >= at) {
      continue;
    }
    if (block.to > at) {
      return { block, tail: false };
    }
    if (block.kind === "table" && block.to === at && rows) {
      return { block, tail: true };
    }
  }
  return undefined;
}

/** One side of a hunk as Markdown, with its changed lines and words marked. */
export function ghostMarkdown(
  old: string,
  current: string,
  side: "before" | "after" = "before",
  words?: WordBudget,
): string {
  return alignBlocks(old, current)
    .map((row) => rowMarkdown(row, words))
    .flatMap((row) => (row[side] ? [row[side]] : []))
    .join("\n\n");
}

/** The shared word-diff budget of one rebuild. */
class Budget implements WordBudget {
  constructor(
    private left: number,
    private chars: number,
  ) {}
  /**
   * Whether a word diff of these texts fits; spends its tokens if so. Texts
   * are also capped by length, checked first: a few very long tokens cost
   * little in tokens but a lot to mark and protect.
   */
  spend(old: string, current: string): boolean {
    const length = old.length + current.length;
    if (length > HUNK_CHARS || length > this.chars) {
      return false;
    }
    const cost = tokens(old).length + tokens(current).length;
    if (cost > HUNK_TOKENS || cost > this.left) {
      return false;
    }
    this.left -= cost;
    this.chars -= length;
    return true;
  }
}

interface Context {
  readonly blocks: readonly Block[];
  readonly actions: InlineActions;
  readonly budget: Budget;
}

function ghost(
  state: EditorState,
  hunk: DocHunk,
  context: Context,
  options: {
    kind: GhostKind;
    words?: WordBudget;
    sides?: { old: string; now: string } | undefined;
  },
): Range<Decoration> {
  const { kind, words = context.budget, sides } = options;
  const { diff } = context.actions;
  let markdown: string;
  if (kind === "removed") {
    // A standalone removal: just the removed text, not its neighbours.
    markdown = ghostMarkdown(hunk.old, "", "before", words);
  } else {
    // Whole enclosing blocks, so a table keeps its header and code its fences.
    const { old, now } = sides ?? diff.context(state, hunk);
    markdown =
      kind === "added"
        ? ghostMarkdown(old, now, "after", words)
        : ghostMarkdown(old, now, "before", words);
  }
  const widget = new GhostBlock(
    { hunk, markdown, kind, label: diff.label() },
    context.actions,
  );
  const block = diff.blockRange(state, hunk.from, hunk.to);
  const atEnd = hunk.kind === "deleted" && hunk.atEnd;
  const at = atEnd ? hunk.from : Math.min(hunk.from, block.from);
  return Decoration.widget({ widget, block: true, side: atEnd ? 1 : -1 }).range(
    at,
  );
}

function hunkDecorations(
  state: EditorState,
  hunk: DocHunk,
  context: Context,
): Range<Decoration>[] {
  if (hunk.kind === "deleted") {
    const inBlock = removedInsideBlock(hunk, context.blocks, state);
    if (!inBlock) {
      return [ghost(state, hunk, context, { kind: "removed" })];
    }
    // Both sides of the surviving block, so only the deletion is marked.
    const { block, tail } = inBlock;
    const sides = tail
      ? { old: `${block.text}\n${hunk.old}`, now: block.text }
      : undefined;
    return [ghost(state, hunk, context, { kind: "before", sides })];
  }
  const kind = hunk.kind === "added" ? "added" : "modified";
  const lines = lineMarks(state, hunk, `mw-gi-${kind}`, context.actions.diff);
  // A rendered block hides source marks: show its other version beside it.
  if (touchesRenderedBlock(hunk, context.blocks, state)) {
    return [
      ...lines,
      ghost(state, hunk, context, {
        kind: hunk.kind === "added" ? "added" : "before",
      }),
    ];
  }
  if (hunk.kind === "added") {
    return lines;
  }
  const current = state.sliceDoc(hunk.from, hunk.to);
  if (!context.budget.spend(hunk.old, current)) {
    // Too long to diff word by word now: the line-level view.
    return [
      ...lines,
      ghost(state, hunk, context, { kind: "before", words: LINES_ONLY }),
    ];
  }
  return wordMarks(hunk, current);
}

/** A rewritten passage as removed-word widgets and inserted-word marks. */
function wordMarks(hunk: DocHunk, current: string): Range<Decoration>[] {
  const out: Range<Decoration>[] = [];
  let at = hunk.from;
  for (const segment of wordDiff(hunk.old, current)) {
    if (segment.type === "delete") {
      out.push(
        Decoration.widget({
          widget: new RemovedText(segment.text),
          side: -1,
        }).range(at),
      );
    } else {
      const end = at + segment.text.length;
      if (segment.type === "insert" && segment.text.trim()) {
        out.push(
          Decoration.mark({ class: "mw-gd-ins mw-gi-inserted" }).range(at, end),
        );
      }
      at = end;
    }
  }
  return out;
}

export function buildInline(
  state: EditorState,
  set: HunkSet,
  actions: InlineActions,
): DecorationSet {
  if (set.hunks.length === 0) {
    return Decoration.none;
  }
  const context: Context = {
    blocks: splitBlocks(state.doc.toString()),
    actions,
    budget: new Budget(REBUILD_TOKENS, REBUILD_CHARS),
  };
  const ranges = set.hunks.flatMap((hunk) =>
    hunkDecorations(state, hunk, context),
  );
  return Decoration.set(ranges, true);
}

/** Track-changes decorations, rebuilt when the gutter recomputes its hunks. */
export function inlineChanges(actions: InlineActions): Extension {
  const { field } = actions.diff;
  const generation = (state: EditorState) =>
    state.field(field, false)?.generation;
  return StateField.define<DecorationSet>({
    create: (state) => {
      const set = state.field(field, false);
      return set ? buildInline(state, set, actions) : Decoration.none;
    },
    update(value, tr) {
      const set = tr.state.field(field, false);
      if (!set) {
        return Decoration.none;
      }
      if (generation(tr.startState) !== set.generation || tr.reconfigured) {
        return buildInline(tr.state, set, actions);
      }
      return value.map(tr.changes);
    },
    provide: (self) => EditorView.decorations.from(self),
  });
}
