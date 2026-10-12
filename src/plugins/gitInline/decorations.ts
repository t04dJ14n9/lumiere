import { StateField } from "@codemirror/state";
import type { EditorState, Extension, Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import {
  alignBlocks,
  rowMarkdown,
  splitBlocks,
  wordDiff,
} from "../../shared/diff";
import type { Block } from "../../shared/diff";
import type { DocHunk, GitDiff, HunkSet } from "../gitGutter/api";
import type { RenderPass, RenderService } from "../render/api";

export interface InlineActions {
  readonly diff: GitDiff;
  readonly render: RenderService;
}

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

/** The baseline version of a removed or rewritten block, rendered, with Restore. */
class GhostBlock extends WidgetType {
  private passes: RenderPass[] = [];
  constructor(
    readonly hunk: DocHunk,
    readonly markdown: string,
    private readonly actions: InlineActions,
  ) {
    super();
  }
  override eq(other: GhostBlock): boolean {
    return (
      other.markdown === this.markdown &&
      other.hunk.kind === this.hunk.kind &&
      other.hunk.oldLine === this.hunk.oldLine
    );
  }
  override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    const removed = this.hunk.kind === "deleted";
    root.className = `mw-gi-ghost ${removed ? "is-removed" : "is-before"}`;
    const caption = root.appendChild(document.createElement("div"));
    caption.className = "mw-gi-caption";
    const label = caption.appendChild(document.createElement("span"));
    label.textContent = `${removed ? "Removed" : "Before"} · line ${this.hunk.oldLine} in ${this.actions.diff.label()}`;
    const restore = caption.appendChild(document.createElement("button"));
    restore.type = "button";
    restore.className = "mw-gi-restore";
    restore.textContent = "Restore";
    restore.title = "Put the baseline text back";
    restore.addEventListener("mousedown", (event) => event.preventDefault());
    restore.addEventListener("click", (event) => {
      event.preventDefault();
      const current = view.state
        .field(this.actions.diff.field)
        .hunks.find(
          (hunk) =>
            hunk.oldLine === this.hunk.oldLine && hunk.old === this.hunk.old,
        );
      if (current) {
        this.actions.diff.revert(current);
      }
    });
    const content = root.appendChild(document.createElement("div"));
    content.className = "mw-gi-ghost-body";
    void this.actions.render
      .into(content, this.markdown, {
        readOnly: true,
        measure: () => view.requestMeasure(),
      })
      .then((pass) => {
        this.passes.push(pass);
        view.requestMeasure();
      })
      .catch(() => {
        content.textContent = this.markdown;
      });
    return root;
  }
  override destroy(): void {
    for (const pass of this.passes) {
      void pass.dispose();
    }
    this.passes = [];
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

/** The baseline side of a hunk as Markdown, with its changed lines and words marked. */
export function ghostMarkdown(old: string, current: string): string {
  return alignBlocks(old, current)
    .map(rowMarkdown)
    .flatMap((row) => (row.before ? [row.before] : []))
    .join("\n\n");
}

function hunkDecorations(
  state: EditorState,
  hunk: DocHunk,
  context: { blocks: readonly Block[]; actions: InlineActions },
): Range<Decoration>[] {
  const out: Range<Decoration>[] = [];
  const { doc } = state;
  const lines = (cls: string) => {
    for (
      let n = doc.lineAt(hunk.from).number;
      n <= doc.lineAt(hunk.to).number;
      n++
    ) {
      out.push(Decoration.line({ class: cls }).range(doc.line(n).from));
    }
  };
  const block = context.actions.diff.blockRange(state, hunk.from, hunk.to);
  const before = Math.min(hunk.from, block.from);
  if (hunk.kind === "deleted") {
    const widget = new GhostBlock(
      hunk,
      ghostMarkdown(hunk.old, ""),
      context.actions,
    );
    out.push(
      Decoration.widget({
        widget,
        block: true,
        side: hunk.atEnd ? 1 : -1,
      }).range(hunk.atEnd ? hunk.from : before),
    );
    return out;
  }
  if (hunk.kind === "added") {
    lines("mw-gi-added");
    return out;
  }
  const current = state.sliceDoc(hunk.from, hunk.to);
  if (touchesRenderedBlock(hunk, context.blocks, state)) {
    lines("mw-gi-modified");
    const widget = new GhostBlock(
      hunk,
      ghostMarkdown(hunk.old, current),
      context.actions,
    );
    out.push(
      Decoration.widget({ widget, block: true, side: -1 }).range(before),
    );
    return out;
  }
  out.push(...wordMarks(hunk, current));
  return out;
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
  const blocks = splitBlocks(state.doc.toString());
  const ranges = set.hunks.flatMap((hunk) =>
    hunkDecorations(state, hunk, { blocks, actions }),
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
