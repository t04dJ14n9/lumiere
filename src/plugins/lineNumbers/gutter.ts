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

/** One gutter cell: a single line's label, or a rendered block's stack. */
export class LineNumberMarker extends GutterMarker {
  constructor(readonly labels: readonly string[]) {
    super();
  }
  override eq(other: GutterMarker): boolean {
    return (
      other instanceof LineNumberMarker &&
      other.labels.length === this.labels.length &&
      other.labels.every((label, index) => label === this.labels[index])
    );
  }
  override toDOM(): Node {
    if (this.labels.length === 1) {
      return document.createTextNode(this.labels[0] ?? "");
    }
    const stack = document.createElement("div");
    stack.className = "mw-line-number-stack";
    stack.style.setProperty("--lines", String(this.labels.length));
    for (const label of this.labels) {
      const row = document.createElement("div");
      row.textContent = label;
      stack.append(row);
    }
    return stack;
  }
}

function cursorLine(state: EditorState): number {
  return state.doc.lineAt(state.selection.main.head).number;
}

/** Labels for source lines `first`..`last` (a rendered block covers several). */
export function blockLabels(
  state: EditorState,
  block: Pick<BlockInfo, "from" | "to"> & { type: BlockInfo["type"] },
  style: LineNumberStyle,
): string[] | null {
  if (block.type !== BlockType.WidgetRange && block.type !== BlockType.Text) {
    return null;
  }
  const first = state.doc.lineAt(block.from).number;
  const last =
    block.type === BlockType.Text ? first : state.doc.lineAt(block.to).number;
  const cursor = cursorLine(state);
  const labels: string[] = [];
  for (let n = first; n <= last; n++) {
    labels.push(lineLabel(n, cursor, style));
  }
  return labels;
}

function spacer(view: EditorView): LineNumberMarker {
  const digits = Math.max(minDigits, String(view.state.doc.lines).length);
  return new LineNumberMarker(["9".repeat(digits)]);
}

/**
 * A line-number gutter laid out like VS Code's: every source line has a
 * number, including the lines a rendered block (table, callout, math, embed)
 * hides, which stack beside the block.
 */
export function lineNumberGutter(style: LineNumberStyle): Extension {
  if (style === "off") {
    return [];
  }
  const marker = (view: EditorView, block: BlockInfo) => {
    const labels = blockLabels(view.state, block, style);
    return labels ? new LineNumberMarker(labels) : null;
  };
  return [
    gutter({
      class: "cm-lineNumbers",
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
