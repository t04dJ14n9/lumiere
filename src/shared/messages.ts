/**
 * Every message between the extension (host) and the PDF viewer (webview).
 *
 *   host                              viewer
 *    │  ◄──────────── ready               the page has loaded
 *    │  load { data } ──────────►         the PDF bytes
 *    │  ◄──────────── outline { items }   bookmarks, once read
 *    │  ◄──────────── selection { … }     after each selection change; for a
 *    │                                    region, again with its text and image
 *    │  ◄──────────── copyForAgent        the viewer's Copy for Agent button
 *    │  ◄──────────── askAgent            the viewer's Ask Agent button
 *    │  ◄──────────── toggleOutline       the slim bar's outline button
 *    │  ◄──────────── openExternal        a web link clicked in the PDF
 *    │  ◄──────────── view { view }       page and zoom, after each change
 *    │  goTo { location } ──────►         open a page (and box)
 *    │  action { action } ──────►         page, zoom, find or tool, from a command
 *    │  toolbar { toolbar } ────►         the toolbar setting changed
 *
 * The viewer runs untrusted PDF content, so the host validates what it
 * receives with `parseViewerMessage`.
 */
import type { PdfLocation } from './pdf-location';
import { parseSelection, type PdfSelection } from './selection';
import type { ToolbarSettings } from './toolbar-settings';
import { parseViewState, type ViewerAction, type ViewState } from './view-state';

/** One entry of the PDF's outline (bookmarks), with the page it opens. */
export interface OutlineItem {
  title: string;
  /** Missing for entries that only group others or point outside the PDF. */
  page?: number;
  /** How far down the page the entry opens, in points from its top; missing for the top. */
  top?: number;
  children: OutlineItem[];
}

export type ViewerMessage =
  | { type: 'ready' }
  | { type: 'outline'; items: OutlineItem[] }
  /** `image`: for a region, a PNG of the box as a `data:image/png;base64,` URL. */
  | { type: 'selection'; selection: PdfSelection | null; image?: string }
  | { type: 'copyForAgent' }
  | { type: 'askAgent' }
  /** The viewer's outline button: show or hide the PDF Outline view. */
  | { type: 'toggleOutline' }
  | { type: 'openExternal'; url: string }
  | { type: 'error'; message: string }
  | { type: 'view'; view: ViewState };

export type HostMessage =
  | { type: 'load'; data: ArrayBuffer }
  /** `top`: with no box, show the page from this many points below its top. */
  | { type: 'goTo'; location: PdfLocation; top?: number }
  | { type: 'action'; action: ViewerAction }
  | { type: 'toolbar'; toolbar: ToolbarSettings };

const MAX_OUTLINE_ITEMS = 10_000;
const MAX_OUTLINE_DEPTH = 32;
const MAX_TITLE_LENGTH = 500;
/** Larger than any real page, in points (PDF pages are at most 14,400 points). */
const MAX_PAGE_OFFSET = 1_000_000;
/** About 6 MB of PNG; region snapshots are capped at 2,000 pixels a side. */
const MAX_IMAGE_LENGTH = 8_000_000;

/** Accept a message from the viewer only if it is well-formed. */
export function parseViewerMessage(value: unknown): ViewerMessage | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case 'ready':
    case 'copyForAgent':
    case 'askAgent':
    case 'toggleOutline':
      return { type: message.type };
    case 'selection': {
      const selection = parseSelection(message.selection) ?? null;
      const image = selection?.kind === 'region' && isPngDataUrl(message.image) ? message.image : undefined;
      return { type: 'selection', selection, ...(image ? { image } : {}) };
    }
    case 'outline':
      return { type: 'outline', items: parseOutline(message.items) };
    case 'openExternal':
      return isWebUrl(message.url) ? { type: 'openExternal', url: message.url } : undefined;
    case 'error':
      return typeof message.message === 'string'
        ? { type: 'error', message: message.message.slice(0, 1_000) }
        : undefined;
    case 'view': {
      const view = parseViewState(message.view);
      return view ? { type: 'view', view } : undefined;
    }
    default:
      return undefined;
  }
}

/** A region snapshot: a PNG as a base64 data URL, of a sane size. */
function isPngDataUrl(value: unknown): value is string {
  const prefix = 'data:image/png;base64,';
  return typeof value === 'string' && value.startsWith(prefix) && value.length <= MAX_IMAGE_LENGTH
    && /^[A-Za-z0-9+/]+={0,2}$/u.test(value.slice(prefix.length));
}

/** Only web and mail links may leave the viewer; a PDF can contain any URI. */
function isWebUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 8_192 && /^(https?:\/\/|mailto:)\S+$/i.test(value);
}

function isPageOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < MAX_PAGE_OFFSET;
}

function parseOutline(value: unknown): OutlineItem[] {
  let budget = MAX_OUTLINE_ITEMS;
  const visit = (items: unknown, depth: number): OutlineItem[] => {
    if (!Array.isArray(items) || depth > MAX_OUTLINE_DEPTH) return [];
    const result: OutlineItem[] = [];
    for (const item of items as unknown[]) {
      if (budget-- <= 0 || typeof item !== 'object' || item === null) break;
      const { title, page, top, children } = item as Record<string, unknown>;
      if (typeof title !== 'string') continue;
      const hasPage = Number.isSafeInteger(page) && (page as number) >= 1;
      result.push({
        title: title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH) || 'Untitled',
        ...(hasPage ? { page: page as number } : {}),
        ...(hasPage && isPageOffset(top) ? { top } : {}),
        children: visit(children, depth + 1),
      });
    }
    return result;
  };
  return visit(value, 0);
}
