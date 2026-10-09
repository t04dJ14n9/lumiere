import type { Text } from "@codemirror/state";
import {
  BlockType,
  GutterMarker,
  lineNumberWidgetMarker,
} from "@codemirror/view";

/** The number of a source line hidden behind a rendered block. */
export class WidgetLineNumber extends GutterMarker {
  constructor(readonly number: number) {
    super();
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof WidgetLineNumber && other.number === this.number;
  }
  override toDOM(): Node {
    return document.createTextNode(String(this.number));
  }
}

/**
 * A rendered block (a table, callout, embed, math or diagram) replaces whole
 * source lines, and CodeMirror leaves its gutter cell empty. Obsidian numbers
 * such a block with its first line, so the numbers stay continuous. Widgets
 * that replace nothing, like the inline title, keep an empty cell.
 */
export function widgetLineNumber(
  doc: Text,
  block: {
    readonly type: BlockType | readonly unknown[];
    readonly from: number;
  },
): WidgetLineNumber | null {
  if (block.type !== BlockType.WidgetRange) {
    return null;
  }
  return new WidgetLineNumber(doc.lineAt(block.from).number);
}

export const widgetLineNumbers = lineNumberWidgetMarker.of(
  (view, _widget, block) => widgetLineNumber(view.state.doc, block),
);
