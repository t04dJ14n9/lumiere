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
import { parseSelection, type PdfSelection } from './selection';

/** One entry of the PDF's outline (bookmarks), with the page it opens. */
export interface OutlineItem {
  title: string;
  /** Missing for entries that only group others or point outside the PDF. */
  page?: number;
  children: OutlineItem[];
}

export type ViewerMessage =
  | { type: 'ready' }
  | { type: 'outline'; items: OutlineItem[] }
  | { type: 'selection'; selection: PdfSelection | null }
  | { type: 'copyForAgent' }
  | { type: 'openExternal'; url: string }
  | { type: 'error'; message: string };

export type HostMessage =
  | { type: 'load'; data: ArrayBuffer }
  | { type: 'goTo'; location: PdfLocation };

const MAX_OUTLINE_ITEMS = 10_000;
const MAX_OUTLINE_DEPTH = 32;
const MAX_TITLE_LENGTH = 500;

/** Accept a message from the viewer only if it is well-formed. */
export function parseViewerMessage(value: unknown): ViewerMessage | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case 'ready':
    case 'copyForAgent':
      return { type: message.type };
    case 'selection':
      return { type: 'selection', selection: parseSelection(message.selection) ?? null };
    case 'outline':
      return { type: 'outline', items: parseOutline(message.items) };
    case 'openExternal':
      return isWebUrl(message.url) ? { type: 'openExternal', url: message.url } : undefined;
    case 'error':
      return typeof message.message === 'string'
        ? { type: 'error', message: message.message.slice(0, 1_000) }
        : undefined;
    default:
      return undefined;
  }
}

/** Only web and mail links may leave the viewer; a PDF can contain any URI. */
function isWebUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 8_192 && /^(https?:\/\/|mailto:)\S+$/i.test(value);
}

function parseOutline(value: unknown): OutlineItem[] {
  let budget = MAX_OUTLINE_ITEMS;
  const visit = (items: unknown, depth: number): OutlineItem[] => {
    if (!Array.isArray(items) || depth > MAX_OUTLINE_DEPTH) return [];
    const result: OutlineItem[] = [];
    for (const item of items as unknown[]) {
      if (budget-- <= 0 || typeof item !== 'object' || item === null) break;
      const { title, page, children } = item as Record<string, unknown>;
      if (typeof title !== 'string') continue;
      result.push({
        title: title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH) || 'Untitled',
        ...(Number.isSafeInteger(page) && (page as number) >= 1 ? { page: page as number } : {}),
        children: visit(children, depth + 1),
      });
    }
    return result;
  };
  return visit(value, 0);
}
