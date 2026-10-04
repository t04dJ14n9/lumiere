/**
 * Locations inside a PDF and the link format that carries them.
 *
 * A location is written as a URL fragment using the `page` and `viewrect`
 * parameters of RFC 8118 (the `application/pdf` media type), for example
 *
 *     paper.pdf#page=3&viewrect=72,83,134,21
 *
 * Agents can read such a link without tools, and the extension can open it.
 */
import type { ViewRect } from './geometry';
export interface PdfLocation {
    /** 1-based page number. */
    page: number;
    /** A box on that page, in points from its top-left corner. */
    viewRect?: ViewRect;
}
/** `page=3&viewrect=72,83,134,21`, rounded to a tenth of a point. */
export declare function formatLocationFragment(location: PdfLocation): string;
/**
 * Read a location from a link fragment. Unknown parameters are ignored; an
 * invalid page makes the whole fragment invalid, an invalid box is dropped.
 */
export declare function parseLocationFragment(fragment: string): PdfLocation | undefined;
/** A link to `location` in the PDF at `path` (a path or URL, used as given). */
export declare function pdfLink(path: string, location: PdfLocation): string;
