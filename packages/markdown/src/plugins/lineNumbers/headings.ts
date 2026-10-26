import { syntaxTree } from "@codemirror/language";
import {
  RangeSet,
  StateField,
  type EditorState,
  type Range,
} from "@codemirror/state";
import { GutterMarker, gutterLineClass } from "@codemirror/view";
import { documentTree } from "../livePreview/api";

const activeTree = (state: EditorState) =>
  state.field(documentTree, false) ?? syntaxTree(state);

/**
 * Marks the gutter cells of heading, code and list item lines, so line
 * numbers align with their larger or smaller text and their padding.
 */
class HeadingLine extends GutterMarker {
  override elementClass: string;
  constructor(
    readonly level: number,
    readonly isFirstLine: boolean,
  ) {
    super();
    // Line 1 has no padding above its heading (livePreview/inline.ts).
    this.elementClass = `md-h${level}-gutter${isFirstLine ? " is-first-line" : ""}`;
  }
  override eq(other: GutterMarker): boolean {
    return (
      other instanceof HeadingLine &&
      other.level === this.level &&
      other.isFirstLine === this.isFirstLine
    );
  }
}
const levels = [1, 2, 3, 4, 5, 6];
const markers = levels.map((level) => new HeadingLine(level, false));
const firstLineMarkers = levels.map((level) => new HeadingLine(level, true));

class CodeLine extends GutterMarker {
  override elementClass = "md-code-gutter";
  override eq(other: GutterMarker): boolean {
    return other instanceof CodeLine;
  }
}
const codeLine = new CodeLine();

class ListLine extends GutterMarker {
  override elementClass = "md-list-gutter";
  override eq(other: GutterMarker): boolean {
    return other instanceof ListLine;
  }
}
const listLine = new ListLine();
// Headings are blocks; these are the only nodes that can contain one.
const containers = new Set([
  "Document",
  "Blockquote",
  "BulletList",
  "OrderedList",
  "ListItem",
]);

export function headingLines(state: EditorState): RangeSet<GutterMarker> {
  const ranges: Range<GutterMarker>[] = [];
  activeTree(state).iterate({
    enter(node) {
      const level = /^(?:ATXHeading|SetextHeading)(\d)$/.exec(node.name)?.[1];
      if (level) {
        const from = state.doc.lineAt(node.from).from;
        const marker = (from === 0 ? firstLineMarkers : markers)[
          Number(level) - 1
        ]!;
        ranges.push(marker.range(from));
        return false;
      }
      if (node.name === "ListItem") {
        // As Live Preview pads them: an item's first line, outside quotes.
        const line = state.doc.lineAt(node.from);
        if (!/\S/u.test(state.sliceDoc(line.from, node.from))) {
          ranges.push(listLine.range(line.from));
        }
      }
      if (node.name === "FencedCode") {
        const last = state.doc.lineAt(node.to).number;
        for (let n = state.doc.lineAt(node.from).number; n <= last; n++) {
          ranges.push(codeLine.range(state.doc.line(n).from));
        }
        return false;
      }
      return containers.has(node.name);
    },
  });
  return RangeSet.of(ranges, true);
}

export const headingGutterClasses = StateField.define<RangeSet<GutterMarker>>({
  create: headingLines,
  update(value, transaction) {
    return activeTree(transaction.state) === activeTree(transaction.startState)
      ? value
      : headingLines(transaction.state);
  },
  provide: (field) => gutterLineClass.from(field),
});
