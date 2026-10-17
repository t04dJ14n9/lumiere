/**
 * Rectangles on a PDF page, in PDF points (1/72 inch) with the origin at the
 * page's top-left corner, the way the viewer measures them.
 */

/** `[left, top, right, bottom]`. */
export type PageRect = readonly [left: number, top: number, right: number, bottom: number];

/** The same box as RFC 8118's `viewrect`: its corner and size. */
export interface ViewRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function isPageRect(value: unknown): value is PageRect {
  if (!Array.isArray(value) || value.length !== 4) return false;
  const [left, top, right, bottom] = value as unknown[];
  return [left, top, right, bottom].every(n => typeof n === 'number' && Number.isFinite(n))
    && (right as number) > (left as number)
    && (bottom as number) > (top as number);
}

/** The smallest rectangle containing all of `rects`. */
export function boundingRect(rects: readonly PageRect[]): PageRect {
  if (rects.length === 0) throw new RangeError('No rectangles to bound');
  return [
    Math.min(...rects.map(rect => rect[0])),
    Math.min(...rects.map(rect => rect[1])),
    Math.max(...rects.map(rect => rect[2])),
    Math.max(...rects.map(rect => rect[3])),
  ];
}

export function toViewRect([left, top, right, bottom]: PageRect): ViewRect {
  return { left, top, width: right - left, height: bottom - top };
}

export function fromViewRect({ left, top, width, height }: ViewRect): PageRect {
  return [left, top, left + width, top + height];
}
