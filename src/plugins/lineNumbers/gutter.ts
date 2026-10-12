import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import type { EditorState, Extension } from "@codemirror/state";
import {
  BlockType,
  GutterMarker,
  gutter,
  highlightActiveLineGutter,
} from "@codemirror/view";
import type { BlockInfo, EditorView, ViewUpdate } from "@codemirror/view";
import { lineSelection, startLineSelection } from "./line-selection";

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
    lineSelection,
  ];
}
