import { syntaxTree } from "@codemirror/language";
import {
  RangeSet,
  StateField,
  type EditorState,
  type Range,
} from "@codemirror/state";
import { GutterMarker, gutterLineClass } from "@codemirror/view";

/**
 * Marks the gutter cells of heading, code and list item lines, so line
 * numbers align with their larger or smaller text and their padding.
 */
class HeadingLine extends GutterMarker {
  override elementClass: string;
  constructor(readonly level: number) {
    super();
    this.elementClass = `md-h${level}-gutter`;
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof HeadingLine && other.level === this.level;
  }
}
const markers = [1, 2, 3, 4, 5, 6].map((level) => new HeadingLine(level));

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
  syntaxTree(state).iterate({
    enter(node) {
      const level = /^(?:ATXHeading|SetextHeading)(\d)$/.exec(node.name)?.[1];
      if (level) {
        const marker = markers[Number(level) - 1]!;
        ranges.push(marker.range(state.doc.lineAt(node.from).from));
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
    return syntaxTree(transaction.state) === syntaxTree(transaction.startState)
      ? value
      : headingLines(transaction.state);
  },
  provide: (field) => gutterLineClass.from(field),
});
