import { syntaxTree } from "@codemirror/language";
import { RangeSet, StateField, type EditorState } from "@codemirror/state";
import { GutterMarker, gutterLineClass } from "@codemirror/view";

/** Marks a heading line's gutter cells, so line numbers align with the larger text. */
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
// Headings are blocks; these are the only nodes that can contain one.
const containers = new Set([
  "Document",
  "Blockquote",
  "BulletList",
  "OrderedList",
  "ListItem",
]);

export function headingLines(state: EditorState): RangeSet<GutterMarker> {
  const ranges: ReturnType<HeadingLine["range"]>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      const level = /^(?:ATXHeading|SetextHeading)(\d)$/.exec(node.name)?.[1];
      if (level) {
        const marker = markers[Number(level) - 1]!;
        ranges.push(marker.range(state.doc.lineAt(node.from).from));
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
