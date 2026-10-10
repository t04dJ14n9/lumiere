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

/**
 * The schema of a saved position. Saved state of any other version (older or
 * newer, as after a downgrade) is ignored and the PDF opens with the defaults;
 * there is no migration, so bump this when the shape or the meaning of a field
 * changes.
 */
export const SAVED_POSITION_VERSION = 1;

/** What is stored for a position: the position and the schema it follows. */
export function savedPosition(position: ReadingPosition): object {
  return { version: SAVED_POSITION_VERSION, ...position };
}

/** Reads what `savedPosition` stored; anything else is not a position. */
export function parseSavedPosition(value: unknown): ReadingPosition | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { version?: unknown }).version !== SAVED_POSITION_VERSION
  )
    return undefined;
  return parseReadingPosition(value);
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
