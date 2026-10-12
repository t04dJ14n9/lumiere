import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { EditorSelection } from "@codemirror/state";
import type { EditorState, Extension } from "@codemirror/state";
import {
  BlockType,
  GutterMarker,
  gutter,
  highlightActiveLineGutter,
} from "@codemirror/view";
import type { BlockInfo, EditorView, ViewUpdate } from "@codemirror/view";

/** VS Code's `editor.lineNumbers` values. */
export type LineNumberStyle = "on" | "off" | "relative" | "interval";

/** VS Code reserves room for at least this many digits (lineNumbersMinChars). */
export const minDigits = 5;

/**
 * The label VS Code's gutter shows for line `n` with the caret on line
 * `cursor`: every number, distances from the caret line, or every tenth
 * number. The caret line always shows its own number.
 */
export function lineLabel(
  n: number,
  cursor: number,
  style: LineNumberStyle,
): string {
  if (style === "off") {
    return "";
  }
  if (style === "relative" && n !== cursor) {
    return String(Math.abs(n - cursor));
  }
  if (style === "interval" && n !== cursor && n % 10 !== 0) {
    return "";
  }
  return String(n);
}

/** One gutter cell: a single line's label. */
export class LineNumberMarker extends GutterMarker {
  /** Set on the cell of a rendered table, whose first row sits below the grips. */
  override elementClass: string;
  constructor(
    readonly label: string,
    kind: "line" | "table" = "line",
  ) {
    super();
    this.elementClass = kind === "table" ? "mw-table-line-number" : "";
  }
  override eq(other: GutterMarker): boolean {
    return (
      other instanceof LineNumberMarker &&
      other.label === this.label &&
      other.elementClass === this.elementClass
    );
  }
  override toDOM(): Node {
    return document.createTextNode(this.label);
  }
}

function cursorLine(state: EditorState): number {
  return state.doc.lineAt(state.selection.main.head).number;
}

/**
 * The number beside a block, or null for a widget that replaces nothing. As in
 * Obsidian 1.14.4 (docs/obsidian-measurements/tables/line-numbers.mjs), a
 * rendered block (table, callout, math, embed) gets ONE number, that of its
 * first source line, at its top; the source lines it hides are not numbered.
 */
export function blockLabel(
  state: EditorState,
  block: Pick<BlockInfo, "from"> & { type: BlockInfo["type"] },
  style: LineNumberStyle,
): string | null {
  if (block.type !== BlockType.WidgetRange && block.type !== BlockType.Text) {
    return null;
  }
  const first = state.doc.lineAt(block.from).number;
  return lineLabel(first, cursorLine(state), style);
}

function isTable(state: EditorState, block: Pick<BlockInfo, "from" | "type">) {
  if (block.type !== BlockType.WidgetRange) {
    return false;
  }
  // The innermost node at the start is the header row; the table is its parent.
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(block.from, 1);
    node;
    node = node.parent
  ) {
    if (node.name === "Table") {
      return true;
    }
  }
  return false;
}

function spacer(view: EditorView): LineNumberMarker {
  const digits = Math.max(minDigits, String(view.state.doc.lines).length);
  return new LineNumberMarker("9".repeat(digits));
}

/**
 * A line-number gutter: VS Code's look, with Obsidian's numbering of rendered
 * blocks (one number at the top of a table, callout, math or embed block).
 */
export function lineNumberGutter(style: LineNumberStyle): Extension {
  if (style === "off") {
    return [];
  }
  const marker = (view: EditorView, block: BlockInfo) => {
    const label = blockLabel(view.state, block, style);
    return label === null
      ? null
      : new LineNumberMarker(
          label,
          isTable(view.state, block) ? "table" : "line",
        );
  };
  return [
    gutter({
      class: "cm-lineNumbers",
      domEventHandlers: { mousedown: startLineSelection },
      lineMarker: marker,
      widgetMarker: (view, _widget, block) => marker(view, block),
      lineMarkerChange:
        style === "on" ? null : (update: ViewUpdate) => update.selectionSet,
      initialSpacer: spacer,
      updateSpacer: (_current, update) => spacer(update.view),
    }),
    highlightActiveLineGutter(),
  ];
}

/**
 * The selection VS Code makes from its line numbers: whole lines from the
 * anchor block to the head block, including the final line break, so the
 * caret lands at the start of the line after the last one selected. Dragging
 * upward keeps the anchor block whole and puts the head at the top.
 */
export function wholeLineSelection(
  state: EditorState,
  anchor: { from: number; to: number },
  head: { from: number; to: number },
): EditorSelection {
  const { doc } = state;
  const after = (pos: number) => {
    const line = doc.lineAt(pos);
    return line.number < doc.lines ? line.to + 1 : line.to;
  };
  const start = (pos: number) => doc.lineAt(pos).from;
  return head.from >= anchor.from
    ? EditorSelection.single(start(anchor.from), after(head.to))
    : EditorSelection.single(after(anchor.to), start(head.from));
}

function blockAtY(view: EditorView, clientY: number): BlockInfo {
  return view.lineBlockAtHeight(clientY - view.documentTop);
}

/** Click, drag and shift+click on a line number, as in VS Code. */
function startLineSelection(
  view: EditorView,
  block: BlockInfo,
  event: Event,
): boolean {
  const mouse = event as MouseEvent;
  if (mouse.button !== 0) {
    return false;
  }
  // Without this the browser starts a native selection in the gutter.
  mouse.preventDefault();
  view.focus();
  let anchor: { from: number; to: number } = block;
  if (mouse.shiftKey) {
    const current = view.state.selection.main;
    const line = view.state.doc.lineAt(current.anchor);
    anchor = { from: line.from, to: line.to };
    // An anchor at a line start after a downward line selection belongs to
    // the line it starts; one at the end of a line selection, to that line.
    if (
      current.anchor > current.head &&
      current.anchor === line.from &&
      line.number > 1
    ) {
      const previous = view.state.doc.line(line.number - 1);
      anchor = { from: previous.from, to: previous.to };
    }
  }
  const select = (head: { from: number; to: number }) =>
    view.dispatch({
      selection: wholeLineSelection(view.state, anchor, head),
      userEvent: "select.pointer",
      scrollIntoView: false,
    });
  select(block);
  const move = (next: MouseEvent) => {
    if ((next.buttons & 1) === 0) {
      return stop();
    }
    select(blockAtY(view, next.clientY));
  };
  const stop = () => {
    view.dom.ownerDocument.removeEventListener("mousemove", move);
    view.dom.ownerDocument.removeEventListener("mouseup", stop);
  };
  view.dom.ownerDocument.addEventListener("mousemove", move);
  view.dom.ownerDocument.addEventListener("mouseup", stop);
  return true;
}
