import type { ViewState } from "./view-state";
import {
  isPageLayout,
  isScrollDirection,
  isScrollMode,
  isZoomChoice,
  parseDefaultZoom,
  type ViewChoices,
  type ZoomChoice,
} from "./view-settings";

/** A panel's reading position, retained on rebuild and saved on closing. */
export interface ReadingPosition extends ViewChoices {
  page: number;
  top: number;
  left: number;
  zoom: ZoomChoice;
}

export function isPageOffset(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1_000_000
  );
}

export function parseReadingPosition(
  value: unknown,
): ReadingPosition | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { page, top, left, zoom, pageLayout, scrollMode, scrollDirection } =
    value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(page) ||
    (page as number) < 1 ||
    !isPageOffset(top) ||
    !isPageOffset(left) ||
    !isZoomChoice(zoom) ||
    !isPageLayout(pageLayout) ||
    !isScrollMode(scrollMode) ||
    !isScrollDirection(scrollDirection)
  )
    return undefined;
  return {
    page: page as number,
    top,
    left,
    zoom: parseDefaultZoom(zoom),
    pageLayout,
    scrollMode,
    scrollDirection,
  };
}

export function positionFromView(view: ViewState): ReadingPosition {
  return {
    page: view.readingPage,
    top: view.top,
    left: view.left,
    zoom: view.zoom,
    pageLayout: view.pageLayout,
    scrollMode: view.scrollMode,
    scrollDirection: view.scrollDirection,
  };
}
