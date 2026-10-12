import { syntaxTree } from "@codemirror/language";
import { StateEffect, StateField } from "@codemirror/state";
import type { EditorState, Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { alignBlocks, rowMarkdown } from "../../shared/diff";
import type { RenderPass, RenderService } from "../render/api";
import type { DocHunk } from "./api";
import { currentText, hunkAt, hunkField } from "./hunks";

/** The open peek, as a document position inside its hunk. */
export const setPeek = StateEffect.define<number | null>();

export const peekState = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setPeek)) {
        return effect.value;
      }
    }
    return value === null ? null : tr.changes.mapPos(value, -1);
  },
});

/** The hunk the peek shows, if it still exists. */
export function peekedHunk(state: EditorState): DocHunk | undefined {
  const at = state.field(peekState, false);
  if (at === null || at === undefined) {
    return undefined;
  }
  return hunkAt(state.field(hunkField).hunks, at, at);
}

export interface PeekActions {
  render: RenderService;
  label(): string;
  move(view: EditorView, direction: 1 | -1): void;
  revert(view: EditorView, hunk: DocHunk): void;
  stage(): Promise<unknown>;
}

/** Old and new Markdown for each side of the peek, aligned by block. */
export function peekMarkdown(
  old: string,
  current: string,
): { before: string; after: string } {
  const rows = alignBlocks(old, current).map(rowMarkdown);
  return {
    before: rows
      .flatMap((row) => (row.before ? [row.before] : []))
      .join("\n\n"),
    after: rows.flatMap((row) => (row.after ? [row.after] : [])).join("\n\n"),
  };
}

interface PeekModel {
  readonly hunk: DocHunk;
  readonly current: string;
  readonly index: number;
  readonly total: number;
  readonly line: number;
}

class PeekWidget extends WidgetType {
  private passes: RenderPass[] = [];
  readonly hunk: DocHunk;
  readonly current: string;
  readonly index: number;
  readonly total: number;
  readonly line: number;
  constructor(
    model: PeekModel,
    private readonly actions: PeekActions,
  ) {
    super();
    ({
      hunk: this.hunk,
      current: this.current,
      index: this.index,
      total: this.total,
      line: this.line,
    } = model);
  }
  override eq(other: PeekWidget): boolean {
    return (
      other.hunk.old === this.hunk.old &&
      other.hunk.kind === this.hunk.kind &&
      other.current === this.current &&
      other.index === this.index &&
      other.total === this.total &&
      other.line === this.line
    );
  }
  override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = `mw-git-peek mw-git-peek-${this.hunk.kind}`;
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Git change");
    root.append(this.header(view), this.body(view));
    return root;
  }
  private header(view: EditorView): HTMLElement {
    const head = document.createElement("div");
    head.className = "mw-git-peek-head";
    const title = head.appendChild(document.createElement("span"));
    title.className = "mw-git-peek-title";
    title.textContent = `Line ${this.line} · ${this.hunk.kind}`;
    const detail = head.appendChild(document.createElement("span"));
    detail.className = "mw-git-peek-detail";
    detail.textContent = `${this.index + 1} of ${this.total} changes · vs ${this.actions.label()}`;
    head.appendChild(document.createElement("span")).className =
      "mw-git-peek-space";
    const button = (
      label: string,
      text: string,
      run: () => void,
      primary = false,
    ) => {
      const element = head.appendChild(document.createElement("button"));
      element.type = "button";
      element.className = `mw-git-peek-button${primary ? " is-primary" : ""}`;
      element.title = label;
      element.setAttribute("aria-label", label);
      element.textContent = text;
      element.addEventListener("mousedown", (event) => event.preventDefault());
      element.addEventListener("click", (event) => {
        event.preventDefault();
        run();
      });
    };
    button("Previous change", "↑", () => this.actions.move(view, -1));
    button("Next change", "↓", () => this.actions.move(view, 1));
    button("Revert this change", "Revert", () =>
      this.actions.revert(view, this.hunk),
    );
    button("Stage the file", "Stage File", () => void this.actions.stage());
    button("Close", "✕", () => view.dispatch({ effects: setPeek.of(null) }));
    return head;
  }
  private body(view: EditorView): HTMLElement {
    const body = document.createElement("div");
    body.className = "mw-git-peek-body";
    const { before, after } = peekMarkdown(this.hunk.old, this.current);
    const side = (label: string, source: string, cls: string) => {
      const pane = body.appendChild(document.createElement("div"));
      pane.className = `mw-git-peek-side ${cls}`;
      const caption = pane.appendChild(document.createElement("div"));
      caption.className = "mw-git-peek-caption";
      caption.textContent = label;
      const content = pane.appendChild(document.createElement("div"));
      void this.actions.render
        .into(content, source, {
          readOnly: true,
          measure: () => view.requestMeasure(),
        })
        .then((pass) => {
          this.passes.push(pass);
          view.requestMeasure();
        })
        .catch(() => {
          content.textContent = source;
        });
    };
    if (this.hunk.kind !== "added") {
      side(this.actions.label(), before, "is-before");
    }
    if (this.hunk.kind !== "deleted") {
      side("Working tree", after, "is-after");
    }
    return body;
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

/** The top-level Markdown blocks (and frontmatter) a range touches. */
export function outerBlock(
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number } {
  let start = from;
  let end = to;
  const front = frontmatterRange(state);
  if (front && from <= front.to) {
    start = Math.min(start, front.from);
    end = Math.max(end, front.to);
  }
  const top = syntaxTree(state).topNode;
  for (let child = top.firstChild; child; child = child.nextSibling) {
    if (child.from <= to && child.to >= from && child.to > child.from) {
      start = Math.min(start, child.from);
      end = Math.max(end, child.to);
    }
  }
  return { from: start, to: end };
}

function frontmatterRange(
  state: EditorState,
): { from: number; to: number } | undefined {
  const { doc } = state;
  if (doc.lines < 2 || doc.line(1).text !== "---") {
    return undefined;
  }
  for (let n = 2; n <= Math.min(doc.lines, 2000); n++) {
    const text = doc.line(n).text;
    if (text === "---" || text === "...") {
      return { from: 0, to: doc.line(n).to };
    }
  }
  return undefined;
}

const closePeek = keymap.of([
  {
    key: "Escape",
    run: (view) => {
      if (view.state.field(peekState) === null) {
        return false;
      }
      view.dispatch({ effects: setPeek.of(null) });
      return true;
    },
  },
]);

function buildPeek(state: EditorState, actions: PeekActions): DecorationSet {
  const hunk = peekedHunk(state);
  if (!hunk) {
    return Decoration.none;
  }
  const { hunks } = state.field(hunkField);
  const widget = new PeekWidget(
    {
      hunk,
      current: currentText(state, hunk),
      index: hunks.indexOf(hunk),
      total: hunks.length,
      line:
        hunk.kind === "deleted"
          ? hunk.oldLine
          : state.doc.lineAt(hunk.from).number,
    },
    actions,
  );
  const below = hunk.kind !== "deleted" || hunk.atEnd;
  // Outside the rendered block (properties, table, callout) the change is in,
  // where the block's widget would hide it.
  const block = outerBlock(state, hunk.from, hunk.to);
  const at = below
    ? state.doc.lineAt(Math.max(hunk.to, block.to)).to
    : Math.min(hunk.from, block.from);
  return Decoration.set(
    Decoration.widget({ widget, block: true, side: below ? 1 : -1 }).range(at),
  );
}

/** The peek zone below a hunk, and Escape to close it. */
export function peekExtension(actions: PeekActions): Extension {
  const decorations = StateField.define<DecorationSet>({
    create: (state) => buildPeek(state, actions),
    update(value, tr) {
      if (
        tr.startState.field(peekState, false) !== tr.state.field(peekState) ||
        tr.startState.field(hunkField, false) !== tr.state.field(hunkField)
      ) {
        return buildPeek(tr.state, actions);
      }
      return value.map(tr.changes);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
  return [peekState, decorations, closePeek];
}
