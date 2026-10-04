/**
 * What the reader has selected in a PDF, as the viewer reports it to the
 * extension. The webview is untrusted, so the extension accepts a selection
 * only through `parseSelection`.
 */
import { type PageRect } from './geometry';
/** Highlighted text, possibly spanning pages; one rectangle per text line. */
export interface TextSelection {
    kind: 'text';
    text: string;
    pages: SelectedPage[];
}
/** A box dragged over a page, for figures, tables and equations. */
export interface RegionSelection {
    kind: 'region';
    page: number;
    rect: PageRect;
}
export type PdfSelection = TextSelection | RegionSelection;
export interface SelectedPage {
    page: number;
    rects: PageRect[];
}
export declare function parseSelection(value: unknown): PdfSelection | undefined;
/** The pages a selection covers, first to last. */
export declare function selectedPages(selection: PdfSelection): SelectedPage[];
