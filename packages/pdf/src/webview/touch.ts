/**
 * Whether this is a touch-only device: an iPad or tablet with no trackpad or
 * mouse. There a finger scrolls the pages, as in every reader on a tablet,
 * rather than dragging out a selection as a mouse does.
 */
export function touchOnly(win: Pick<Window, "matchMedia"> = window): boolean {
  return (
    win.matchMedia("(pointer: coarse)").matches &&
    !win.matchMedia("(any-pointer: fine)").matches
  );
}
