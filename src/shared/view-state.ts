/**
 * Where the reader is in the PDF (page and zoom), and what the editor's own
 * controls ask the viewer to do. Shared by the viewer and the extension's
 * status bar, editor title actions and keybindings.
 */
import { MAX_ZOOM, MIN_ZOOM } from './zoom-steps';

/** A zoom that follows the editor's size. */
export type FitMode = 'width' | 'page';

/** What the viewer reports after each change, for the editor's controls. */
export interface ViewState {
  page: number;
  pageCount: number;
  /** The zoom actually shown, in whole percent. */
  zoomPercent: number;
  fit: FitMode | null;
}

/** What the editor's controls (commands, buttons, status bar) ask the viewer to do. */
export type ViewerAction =
  | { action: 'previousPage' | 'nextPage' | 'zoomIn' | 'zoomOut' | 'fitWidth' | 'fitPage' | 'find' }
  | { action: 'goToPage'; page: number }
  | { action: 'setZoom'; percent: number };

const SIMPLE_ACTIONS = new Set(['previousPage', 'nextPage', 'zoomIn', 'zoomOut', 'fitWidth', 'fitPage', 'find']);

/** Accept a view report only if it is well-formed (it comes from the untrusted viewer). */
export function parseViewState(value: unknown): ViewState | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { page, pageCount, zoomPercent, fit } = value as Record<string, unknown>;
  if (!isCount(pageCount) || !isCount(page) || page > pageCount) return undefined;
  if (typeof zoomPercent !== 'number' || !Number.isFinite(zoomPercent) || zoomPercent <= 0 || zoomPercent > 100_000) return undefined;
  return {
    page,
    pageCount,
    zoomPercent: Math.round(zoomPercent),
    fit: fit === 'width' || fit === 'page' ? fit : null,
  };
}

/** Accept an action only if it is well-formed; numbers are clamped by the viewer. */
export function parseViewerAction(value: unknown): ViewerAction | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { action, page, percent } = value as Record<string, unknown>;
  if (typeof action !== 'string') return undefined;
  if (SIMPLE_ACTIONS.has(action)) return { action } as ViewerAction;
  if (action === 'goToPage') return isCount(page) && page >= 1 ? { action, page } : undefined;
  if (action === 'setZoom') return typeof percent === 'number' && Number.isFinite(percent) && percent > 0 ? { action, percent } : undefined;
  return undefined;
}

/**
 * A page number typed by the reader ("7", " 7 "), clamped to the document;
 * `undefined` for anything else.
 */
export function parsePageInput(text: string, pageCount: number): number | undefined {
  const trimmed = text.trim();
  if (!/^\d{1,9}$/u.test(trimmed) || pageCount < 1) return undefined;
  return Math.min(Math.max(1, Number.parseInt(trimmed, 10)), pageCount);
}

/**
 * A zoom typed by the reader ("140", "140%", "62.5 %"), in percent and
 * clamped to the viewer's zoom range; `undefined` for anything else.
 */
export function parseZoomInput(text: string): number | undefined {
  const match = /^(\d{1,5}(?:\.\d+)?)\s*%?$/u.exec(text.trim());
  if (!match) return undefined;
  const percent = Number.parseFloat(match[1]!);
  if (!(percent > 0)) return undefined;
  return Math.min(Math.max(percent, MIN_ZOOM * 100), MAX_ZOOM * 100);
}

/** "Page 4 / 15", as the status bar shows it. */
export function pageLabel(view: ViewState): string {
  return `Page ${view.page} / ${view.pageCount}`;
}

/** "Fit Width (164%)", "Fit Page (80%)" or "125%". */
export function zoomLabel(view: ViewState): string {
  if (view.fit === 'width') return `Fit Width (${view.zoomPercent}%)`;
  if (view.fit === 'page') return `Fit Page (${view.zoomPercent}%)`;
  return `${view.zoomPercent}%`;
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
