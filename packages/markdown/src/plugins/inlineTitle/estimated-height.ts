/**
 * CodeMirror sizes a block widget from `estimatedHeight` until it measures
 * the widget, and again when a rebuilt decoration sits outside the viewport.
 * The default, -1, is one line. The inline title is an h1-sized wrapping
 * textarea above the note; a long name can be several lines, so a remount
 * without a reserve collapses the height map the same way tall Properties
 * and tables do.
 *
 * Numbers match `inlineTitle.css` / theme tokens: --h1-size ≈ 1.618em,
 * --h1-line-height 1.2, padding-bottom 0.6em, at a 16px body size.
 */
const BODY = 16;
const H1_LINE = BODY * 1.618 * 1.2;
const PAD_BOTTOM = BODY * 0.6;
/** Conservative wrap width for a narrow Live Preview pane. */
const CHARS_PER_LINE = 28;

/** Reserve inline-title height from the display name before DOM measure. */
export function titleEstimatedHeight(title: string): number {
  const text = title.length > 0 ? title : " ";
  const lines = Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));
  return PAD_BOTTOM + lines * H1_LINE;
}
