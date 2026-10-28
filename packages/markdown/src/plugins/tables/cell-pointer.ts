/**
 * Map a pointer into a table cell's source offset or selection range.
 *
 * Rendered clicks use Live Preview's text map. Clicks on the cell's 4×8
 * padding (outside `.table-cell-content` text) miss that map; without a
 * fallback the cell editor defaulted to the end of the text, so a left-pad
 * click typed at the end (Host GUI A06). Obsidian places at the nearest
 * edge of the cell text instead, and uses `cm.posAtCoords(anchor)` /
 * `cm.posAtCoords(head)` when opening a cell from a click or intra-cell drag.
 */

export type CellPointerSelection =
  | number
  | "all"
  | { anchor: number; head: number }
  | {
      anchor: number | { x: number; y: number };
      head: number | { x: number; y: number };
    };

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
 * Measure the rendered inline text bounds inside `.table-cell-content`,
 * ignoring the full-width `<p>` block container when `createTreeWalker` is
 * available.
 */
export function cellTextBounds(element: HTMLElement): {
  left: number;
  right: number;
  width: number;
  height: number;
} {
  const doc = element.ownerDocument;
  if (typeof doc.createTreeWalker === "function") {
    const walker = doc.createTreeWalker(element, 4 /* NodeFilter.SHOW_TEXT */);
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (!node.data.trim()) {
        continue;
      }
      const range = doc.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        left = Math.min(left, rect.left);
        right = Math.max(right, rect.right);
        top = Math.min(top, rect.top);
        bottom = Math.max(bottom, rect.bottom);
      }
    }
    if (left <= right) {
      return {
        left,
        right,
        width: right - left,
        height: Math.max(0, bottom - top),
      };
    }
  }
  const range = doc.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect();
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
  const textBounds = cellTextBounds(element);
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

/** Find the word boundaries around `offset` in `source` for double-click selection. */
export function wordRangeAtOffset(
  source: string,
  offset: number,
): { anchor: number; head: number } {
  if (source.length === 0) {
    return { anchor: 0, head: 0 };
  }
  const clamped = Math.max(0, Math.min(offset, source.length));
  let index = clamped;
  if (
    !(clamped < source.length && isWordChar(source[clamped]!)) &&
    clamped > 0 &&
    isWordChar(source[clamped - 1]!)
  ) {
    index = clamped - 1;
  }
  if (index >= source.length || !isWordChar(source[index]!)) {
    return { anchor: clamped, head: clamped };
  }
  let anchor = index;
  while (anchor > 0 && isWordChar(source[anchor - 1]!)) {
    anchor--;
  }
  let head = index + 1;
  while (head < source.length && isWordChar(source[head]!)) {
    head++;
  }
  return { anchor, head };
}

function isWordChar(ch: string): boolean {
  return /[\p{L}\p{N}_]/u.test(ch);
}
