/**
 * Where the reader is in the PDF (page, zoom and tool), and what the
 * editor's own controls ask the viewer to do. Shared by the viewer and the
 * extension's status bar, editor title actions and keybindings.
 */
import { isAnnotationToolId, type AnnotationToolId } from "./annotation-tools";
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
export type ToolMode = "text" | "region" | "annotate";

/** What the viewer reports after each change, for the editor's controls. */
export interface ViewState extends ViewChoices {
  page: number;
  pageCount: number;
  /** The zoom actually shown, in whole percent. */
  zoomPercent: number;
  fit: FitMode | null;
  tool: ToolMode;
  /** Active EmbedPDF tool while Annotate mode is on; omitted when not annotating. */
  annotationTool?: AnnotationToolId | null;
  canAnnotationUndo?: boolean;
  canAnnotationRedo?: boolean;
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
        | "find"
        | "annotationUndo"
        | "annotationRedo";
    }
  | { action: "goToPage"; page: number }
  | { action: "setZoom"; percent: number }
  | { action: "setTool"; tool: ToolMode }
  | { action: "setAnnotationTool"; tool: AnnotationToolId }
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
  "annotationUndo",
  "annotationRedo",
]);

/** Accept a view report only if it is well-formed (it comes from the untrusted viewer). */
export function parseViewState(value: unknown): ViewState | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const report = value as Record<string, unknown>;
  const { canGoBack, canGoForward, zoomPercent } = report;
  if (
    !validPages(report) ||
    !validZoomPercent(zoomPercent) ||
    !validChoices(report) ||
    typeof canGoBack !== "boolean" ||
    typeof canGoForward !== "boolean"
  ) {
    return undefined;
  }
  const { fit, tool } = report;
  const view: ViewState = {
    page: report.page,
    pageCount: report.pageCount,
    zoomPercent: Math.round(zoomPercent),
    fit: fit === "width" || fit === "page" ? fit : null,
    tool: asToolMode(tool),
    pageLayout: report.pageLayout,
    scrollMode: report.scrollMode,
    scrollDirection: report.scrollDirection,
    canGoBack,
    canGoForward,
    readingPage: report.readingPage,
    zoom: parseDefaultZoom(report.zoom),
    top: report.top,
    left: report.left,
  };
  if (isAnnotationToolId(report.annotationTool)) {
    view.annotationTool = report.annotationTool;
  } else if (report.annotationTool === null) {
    view.annotationTool = null;
  }
  if (typeof report.canAnnotationUndo === "boolean") {
    view.canAnnotationUndo = report.canAnnotationUndo;
  }
  if (typeof report.canAnnotationRedo === "boolean") {
    view.canAnnotationRedo = report.canAnnotationRedo;
  }
  return view;
}

/** The page, the first visible page and the page count agree. */
function validPages(report: Record<string, unknown>): report is Record<
  string,
  unknown
> & {
  page: number;
  pageCount: number;
  readingPage: number;
} {
  const { page, pageCount, readingPage } = report;
  return (
    isCount(pageCount) &&
    isCount(page) &&
    page <= pageCount &&
    isCount(readingPage) &&
    readingPage >= 1 &&
    readingPage <= pageCount
  );
}

function validZoomPercent(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 100_000
  );
}

/** Layout, scrolling, zoom choice and the place in the page are all valid. */
function validChoices(report: Record<string, unknown>): report is Record<
  string,
  unknown
> & {
  pageLayout: PageLayout;
  scrollMode: ScrollMode;
  scrollDirection: ScrollDirection;
  zoom: ZoomChoice;
  top: number;
  left: number;
} {
  return (
    isPageLayout(report.pageLayout) &&
    isScrollMode(report.scrollMode) &&
    isScrollDirection(report.scrollDirection) &&
    isZoomChoice(report.zoom) &&
    isPageOffset(report.top) &&
    isPageOffset(report.left)
  );
}

/** Accept an action only if it is well-formed; numbers are clamped by the viewer. */
export function parseViewerAction(value: unknown): ViewerAction | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const fields = value as Record<string, unknown>;
  const action = fields.action;
  if (typeof action !== "string") {
    return undefined;
  }
  if (SIMPLE_ACTIONS.has(action)) {
    return { action } as ViewerAction;
  }
  return Object.hasOwn(ACTION_PARSERS, action)
    ? ACTION_PARSERS[action]!(fields)
    : undefined;
}

/** Parsers for the actions that carry a value. */
const ACTION_PARSERS: Readonly<
  Record<string, (fields: Record<string, unknown>) => ViewerAction | undefined>
> = {
  goToPage: ({ page }) =>
    isCount(page) && page >= 1 ? { action: "goToPage", page } : undefined,
  setZoom: ({ percent }) =>
    typeof percent === "number" && Number.isFinite(percent) && percent > 0
      ? { action: "setZoom", percent }
      : undefined,
  setTool: ({ tool }) =>
    tool === "text" || tool === "region" || tool === "annotate"
      ? { action: "setTool", tool }
      : undefined,
  setAnnotationTool: ({ tool }) =>
    isAnnotationToolId(tool)
      ? { action: "setAnnotationTool", tool }
      : undefined,
  setPageLayout: ({ pageLayout }) =>
    isPageLayout(pageLayout)
      ? { action: "setPageLayout", pageLayout }
      : undefined,
  setScrollMode: ({ scrollMode }) =>
    isScrollMode(scrollMode)
      ? { action: "setScrollMode", scrollMode }
      : undefined,
  setScrollDirection: ({ scrollDirection }) =>
    isScrollDirection(scrollDirection)
      ? { action: "setScrollDirection", scrollDirection }
      : undefined,
};

/**
 * A page number typed by the reader ("7", " 7 "), clamped to the document;
 * `undefined` for anything else.
 */
export function parsePageInput(
  text: string,
  pageCount: number,
): number | undefined {
  const trimmed = text.trim();
  if (!/^\d{1,9}$/u.test(trimmed) || pageCount < 1) {
    return undefined;
  }
  return Math.min(Math.max(1, Number.parseInt(trimmed, 10)), pageCount);
}

/**
 * A zoom typed by the reader ("140", "140%", "62.5 %"), in percent and
 * clamped to the viewer's zoom range; `undefined` for anything else.
 */
export function parseZoomInput(text: string): number | undefined {
  const match = /^(\d{1,5}(?:\.\d+)?)\s*%?$/u.exec(text.trim());
  if (!match) {
    return undefined;
  }
  const percent = Number.parseFloat(match[1]!);
  if (!(percent > 0)) {
    return undefined;
  }
  return Math.min(Math.max(percent, MIN_ZOOM * 100), MAX_ZOOM * 100);
}

/** "Page 4 / 15", as the status bar shows it. */
export function pageLabel(view: ViewState): string {
  return `Page ${view.page} / ${view.pageCount}`;
}

/** "Fit Width (164%)", "Fit Page (80%)" or "125%". */
export function zoomLabel(view: ViewState): string {
  if (view.fit === "width") {
    return `Fit Width (${view.zoomPercent}%)`;
  }
  if (view.fit === "page") {
    return `Fit Page (${view.zoomPercent}%)`;
  }
  return `${view.zoomPercent}%`;
}

/** Coerce a reported tool to a known mode; anything else is text. */
function asToolMode(tool: unknown): ToolMode {
  if (tool === "region" || tool === "annotate") {
    return tool;
  }
  return "text";
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
