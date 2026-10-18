/**
 * The order of the viewer's status bar entries, and the priorities that
 * keep it.
 *
 * VS Code and Cursor lay right-aligned entries out from the bar's right
 * edge in ascending priority, and wrap whatever does not fit onto a second
 * line that is never shown (`flex-direction: row-reverse; flex-wrap: wrap`).
 * So in a crowded bar the entries with the highest priority, on the left,
 * disappear first, and an entry moves whenever one to its right changes
 * width.
 */
export type StatusBarEntryId =
  | "find"
  | "view"
  | "page"
  | "previousPage"
  | "nextPage"
  | "zoom"
  | "zoomOut"
  | "zoomIn";

/**
 * Left to right. Page and zoom are rightmost, so they are the last of the
 * viewer's entries to disappear. Each label ("Page 4 / 15", "Fit Width
 * (164%)") is left of its buttons: a label changes width as the reader
 * pages or zooms, moving everything to its left, and a button the reader
 * clicks again must still be where it was. Paging never changes the zoom
 * (fit zooms use the document's largest page), so the page buttons may sit
 * left of the zoom label.
 */
export const STATUS_BAR_ORDER: readonly StatusBarEntryId[] = [
  "find",
  "view",
  "page",
  "previousPage",
  "nextPage",
  "zoom",
  "zoomOut",
  "zoomIn",
];

/**
 * The rightmost entry's priority: below what extensions usually give theirs
 * (Cursor's own at 98 to 100.6, most at 0 or more, Prettier's at -1), so
 * the viewer's entries sit right of them and outlast them; far above the
 * notifications bell (`-Number.MAX_VALUE`), which stays rightmost.
 */
const RIGHTMOST_PRIORITY = -100;

/** The priority that puts an entry in its place in `STATUS_BAR_ORDER`. */
export function statusBarPriority(id: StatusBarEntryId): number {
  const fromRight = STATUS_BAR_ORDER.length - 1 - STATUS_BAR_ORDER.indexOf(id);
  return RIGHTMOST_PRIORITY + fromRight;
}
