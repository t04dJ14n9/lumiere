import { MAX_ZOOM, MIN_ZOOM } from "./zoom-steps";

export type ZoomChoice = "fitWidth" | "fitPage" | "actual" | number;
export type PageLayout = "single" | "spread" | "spreadCover";
export type ScrollMode = "continuous" | "paged";
export type ScrollDirection = "vertical" | "horizontal";

export interface ViewChoices {
  pageLayout: PageLayout;
  scrollMode: ScrollMode;
  scrollDirection: ScrollDirection;
}

export interface ViewSettings extends ViewChoices {
  /** Numeric values are percentages. */
  defaultZoom: ZoomChoice;
  /** null follows editor.smoothScrolling; the host resolves it before sending. */
  smoothScrolling: boolean | null;
}

export const DEFAULT_VIEW_CHOICES: ViewChoices = {
  pageLayout: "single",
  scrollMode: "continuous",
  scrollDirection: "vertical",
};

export function isPageLayout(value: unknown): value is PageLayout {
  return value === "single" || value === "spread" || value === "spreadCover";
}

export function isScrollMode(value: unknown): value is ScrollMode {
  return value === "continuous" || value === "paged";
}

export function isScrollDirection(value: unknown): value is ScrollDirection {
  return value === "vertical" || value === "horizontal";
}

export function isZoomChoice(value: unknown): value is ZoomChoice {
  return (
    value === "fitWidth" ||
    value === "fitPage" ||
    value === "actual" ||
    (typeof value === "number" && Number.isFinite(value) && value > 0)
  );
}

export function parseDefaultZoom(value: unknown): ZoomChoice {
  if (!isZoomChoice(value)) return "fitWidth";
  return typeof value === "number"
    ? Math.min(MAX_ZOOM * 100, Math.max(MIN_ZOOM * 100, value))
    : value;
}

export function parseViewSettings(value: unknown): ViewSettings {
  const settings =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    defaultZoom: parseDefaultZoom(settings.defaultZoom),
    pageLayout: isPageLayout(settings.pageLayout)
      ? settings.pageLayout
      : "single",
    scrollMode: isScrollMode(settings.scrollMode)
      ? settings.scrollMode
      : "continuous",
    scrollDirection: isScrollDirection(settings.scrollDirection)
      ? settings.scrollDirection
      : "vertical",
    smoothScrolling:
      typeof settings.smoothScrolling === "boolean"
        ? settings.smoothScrolling
        : null,
  };
}

/** Reduced motion wins over explicit and inherited preferences. */
export function resolveSmoothScrolling(
  setting: unknown,
  editor: unknown,
  reducedMotion: boolean,
): boolean {
  return (
    !reducedMotion && (typeof setting === "boolean" ? setting : editor === true)
  );
}
