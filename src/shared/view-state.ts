/**
 * Where the reader is in the PDF (page, zoom and tool), and what the
 * editor's own controls ask the viewer to do. Shared by the viewer and the
 * extension's status bar, editor title actions and keybindings.
 */
import { MAX_ZOOM, MIN_ZOOM } from "./zoom-steps";
import { isPageOffset } from "./reading-position";
import {
  isPageLayout,
  isScrollMode,
  isScrollDirection,
  isZoomChoice,
  parseDefaultZoom,
  type ZoomChoice,
  type ViewChoices,
  type PageLayout,
  type ScrollMode,
  type ScrollDirection,
} from "./view-settings";

/** A zoom that follows the editor's size. */
export type FitMode = "width" | "page";

/**
 * What a drag on a page selects: `text` selects text, or a region when it
 * starts on empty page space; `region` always selects a region.
 */
export type ToolMode = "text" | "region";

/** What the viewer reports after each change, for the editor's controls. */
export interface ViewState extends ViewChoices {
  page: number;
  pageCount: number;
  /** The zoom actually shown, in whole percent. */
  zoomPercent: number;
  fit: FitMode | null;
  tool: ToolMode;
  canGoBack: boolean;
  canGoForward: boolean;
  /** First visible page, which can precede the most-visible page shown in the status bar. */
  readingPage: number;
  /** Exact zoom choice; zoomPercent above is rounded for display only. */
  zoom: ZoomChoice;
  top: number;
  left: number;
}

/** What the editor's controls (commands, buttons, status bar) ask the viewer to do. */
export type ViewerAction =
  | {
      action:
        | "previousPage"
        | "nextPage"
        /** Turn the page keeping the zoom and the place in the page (Preview's Option+Arrow). */
        | "previousPageKeepingPlace"
        | "nextPageKeepingPlace"
        | "zoomIn"
        | "zoomOut"
        | "fitWidth"
        | "fitPage"
        | "actualSize"
        | "find";
    }
  | { action: "goToPage"; page: number }
  | { action: "setZoom"; percent: number }
  | { action: "setTool"; tool: ToolMode }
  | { action: "setPageLayout"; pageLayout: PageLayout }
  | { action: "setScrollMode"; scrollMode: ScrollMode }
  | { action: "setScrollDirection"; scrollDirection: ScrollDirection };

const SIMPLE_ACTIONS = new Set([
  "previousPage",
  "nextPage",
  "previousPageKeepingPlace",
  "nextPageKeepingPlace",
  "zoomIn",
  "zoomOut",
  "fitWidth",
  "fitPage",
  "actualSize",
  "find",
]);

/** Accept a view report only if it is well-formed (it comes from the untrusted viewer). */
export function parseViewState(value: unknown): ViewState | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const {
    page,
    pageCount,
    zoomPercent,
    fit,
    tool,
    canGoBack,
    canGoForward,
    pageLayout,
    scrollMode,
    scrollDirection,
    readingPage,
    zoom,
    top,
    left,
  } = value as Record<string, unknown>;
  if (!isCount(pageCount) || !isCount(page) || page > pageCount)
    return undefined;
  if (
    typeof zoomPercent !== "number" ||
    !Number.isFinite(zoomPercent) ||
    zoomPercent <= 0 ||
    zoomPercent > 100_000
  )
    return undefined;
  if (
    !isPageLayout(pageLayout) ||
    !isScrollMode(scrollMode) ||
    !isScrollDirection(scrollDirection) ||
    !isPageOffset(top) ||
    !isPageOffset(left)
  )
    return undefined;
  if (
    !isCount(readingPage) ||
    readingPage < 1 ||
    readingPage > pageCount ||
    !isZoomChoice(zoom)
  )
    return undefined;
  if (typeof canGoBack !== "boolean" || typeof canGoForward !== "boolean")
    return undefined;
  return {
    page,
    pageCount,
    zoomPercent: Math.round(zoomPercent),
    fit: fit === "width" || fit === "page" ? fit : null,
    tool: tool === "region" ? "region" : "text",
    pageLayout,
    scrollMode,
    scrollDirection,
    canGoBack,
    canGoForward,
    readingPage,
    zoom: parseDefaultZoom(zoom),
    top,
    left,
  };
}

/** Accept an action only if it is well-formed; numbers are clamped by the viewer. */
export function parseViewerAction(value: unknown): ViewerAction | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const {
    action,
    page,
    percent,
    tool,
    pageLayout,
    scrollMode,
    scrollDirection,
  } = value as Record<string, unknown>;
  if (typeof action !== "string") return undefined;
  if (SIMPLE_ACTIONS.has(action)) return { action } as ViewerAction;
  if (action === "goToPage")
    return isCount(page) && page >= 1 ? { action, page } : undefined;
  if (action === "setZoom")
    return typeof percent === "number" &&
      Number.isFinite(percent) &&
      percent > 0
      ? { action, percent }
      : undefined;
  if (action === "setTool")
    return tool === "text" || tool === "region" ? { action, tool } : undefined;
  if (action === "setPageLayout")
    return isPageLayout(pageLayout) ? { action, pageLayout } : undefined;
  if (action === "setScrollMode")
    return isScrollMode(scrollMode) ? { action, scrollMode } : undefined;
  if (action === "setScrollDirection")
    return isScrollDirection(scrollDirection)
      ? { action, scrollDirection }
      : undefined;
  return undefined;
}

/**
 * A page number typed by the reader ("7", " 7 "), clamped to the document;
 * `undefined` for anything else.
 */
export function parsePageInput(
  text: string,
  pageCount: number,
): number | undefined {
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
  if (view.fit === "width") return `Fit Width (${view.zoomPercent}%)`;
  if (view.fit === "page") return `Fit Page (${view.zoomPercent}%)`;
  return `${view.zoomPercent}%`;
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
