/**
 * Ghost blocks render baseline Markdown above/below a hunk. CodeMirror uses
 * estimatedHeight until measure, and again when a rebuilt decoration sits
 * outside the viewport. The default (-1) is one line; a multi-paragraph
 * removal then collapses the height map (scroll/PageDown land in empty space).
 *
 * A single very long paragraph still paints tall via wrap, so count wrapped
 * rows (~80 columns) rather than source newlines alone.
 */
const CAPTION = 36;
const LINE = 24;
const COLS = 80;

/** Reserve ghost widget height from its Markdown source before DOM measure. */
export function ghostEstimatedHeight(markdown: string): number {
  if (!markdown) {
    return CAPTION + LINE;
  }
  let rows = 0;
  for (const line of markdown.split("\n")) {
    rows += Math.max(1, Math.ceil(line.length / COLS));
  }
  return CAPTION + rows * LINE;
}
