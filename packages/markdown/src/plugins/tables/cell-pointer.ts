/**
 * Map a pointer into a table cell's source offset.
 *
 * Rendered clicks use Live Preview's text map. Clicks on the cell's 4×8
 * padding (outside `.table-cell-content` text) miss that map; without a
 * fallback the cell editor defaulted to the end of the text, so a left-pad
 * click typed at the end (Host GUI A06). Obsidian places at the nearest
 * edge of the cell text instead.
 */

/** Closer horizontal edge of the rendered text; empty cells stay at 0. */
export function nearestCellTextOffset(
  textLength: number,
  clientX: number,
  textLeft: number,
  textRight: number,
): number {
  if (textLength <= 0) {
    return 0;
  }
  return Math.abs(clientX - textLeft) <= Math.abs(clientX - textRight)
    ? 0
    : textLength;
}

/**
 * Offset for opening a cell editor from a pointer event. Falls back to the
 * nearest text edge when the rendered mapper misses (padding / empty hit).
 */
export function cellPointerOffset(
  source: string,
  element: HTMLElement,
  point: { clientX: number; clientY: number },
  map?: (
    source: string,
    element: HTMLElement,
    point: { clientX: number; clientY: number },
  ) => number | undefined,
): number {
  const mapped = map?.(source, element, point);
  if (mapped !== undefined) {
    return mapped;
  }
  const doc = element.ownerDocument;
  const range = doc.createRange();
  range.selectNodeContents(element);
  const textBounds = range.getBoundingClientRect();
  // No painted text (empty cell / not laid out): use the content box.
  const left =
    textBounds.width > 0 || textBounds.height > 0
      ? textBounds.left
      : element.getBoundingClientRect().left;
  const right =
    textBounds.width > 0 || textBounds.height > 0
      ? textBounds.right
      : element.getBoundingClientRect().right;
  return nearestCellTextOffset(source.length, point.clientX, left, right);
}
