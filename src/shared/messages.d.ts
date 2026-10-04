/**
 * Every message between the extension (host) and the PDF viewer (webview).
 *
 *   host                              viewer
 *    │  ◄──────────── ready               the page has loaded
 *    │  load { data } ──────────►         the PDF bytes
 *    │  ◄──────────── outline { items }   bookmarks, once read
 *    │  ◄──────────── selection { … }     after each selection change
 *    │  ◄──────────── copyForAgent        the viewer's Copy for Agent button
 *    │  ◄──────────── openExternal        a web link clicked in the PDF
 *    │  goTo { location } ──────►         open a page (and box)
 *
 * The viewer runs untrusted PDF content, so the host validates what it
 * receives with `parseViewerMessage`.
 */
import type { PdfLocation } from './pdf-location';
import { type PdfSelection } from './selection';
/** One entry of the PDF's outline (bookmarks), with the page it opens. */
export interface OutlineItem {
    title: string;
    /** Missing for entries that only group others or point outside the PDF. */
    page?: number;
    children: OutlineItem[];
}
export type ViewerMessage = {
    type: 'ready';
} | {
    type: 'outline';
    items: OutlineItem[];
} | {
    type: 'selection';
    selection: PdfSelection | null;
} | {
    type: 'copyForAgent';
} | {
    type: 'openExternal';
    url: string;
} | {
    type: 'error';
    message: string;
};
export type HostMessage = {
    type: 'load';
    data: ArrayBuffer;
} | {
    type: 'goTo';
    location: PdfLocation;
};
/** Accept a message from the viewer only if it is well-formed. */
export declare function parseViewerMessage(value: unknown): ViewerMessage | undefined;
