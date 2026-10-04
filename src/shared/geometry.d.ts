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
export declare function isPageRect(value: unknown): value is PageRect;
/** The smallest rectangle containing all of `rects`. */
export declare function boundingRect(rects: readonly PageRect[]): PageRect;
export declare function toViewRect([left, top, right, bottom]: PageRect): ViewRect;
export declare function fromViewRect({ left, top, width, height }: ViewRect): PageRect;
