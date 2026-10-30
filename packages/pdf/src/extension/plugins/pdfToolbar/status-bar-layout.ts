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
  | "historyBack"
  | "historyForward"
  | "find"
  | "view"
  | "pageColors"
  | "page"
  | "previousPage"
  | "nextPage"
  | "zoom"
  | "zoomOut"
  | "zoomIn";

/**
 * Left to right. Former chrome title actions (history) sit left of find.
 * Page colors is near View, left of page/zoom so page+zoom stay rightmost.
 * Each label is left of its buttons so a width change does not move a
 * button the reader clicks again.
 */
export const STATUS_BAR_ORDER: readonly StatusBarEntryId[] = [
  "historyBack",
  "historyForward",
  "find",
  "view",
  "pageColors",
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
