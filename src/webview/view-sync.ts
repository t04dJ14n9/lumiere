import { useScrollState } from "./scroll-state";
import { ZoomMode, useZoom } from "@embedpdf/plugin-zoom/react";
import { useCallback, useEffect, useRef } from "react";
import type { FitMode, ToolMode, ViewerAction } from "../shared/view-state";
import type { ViewChoices, ZoomChoice } from "../shared/view-settings";
import { positionFromView } from "../shared/reading-position";
import { rememberPosition } from "./reading-position";
import { nextZoomStep } from "../shared/zoom-steps";
import { reportToHost } from "./host";
import type { Navigation } from "./navigation";
import { DOCUMENT_ID, PAGE_GAP, ZOOM_RANGE } from "./plugins";

/**
 * Keep the extension's controls (status bar, editor title actions) in step
 * with the viewer: report the page, zoom and tool after each change.
 */
export function useViewReporting(
  navigation: Navigation,
  tool: ToolMode,
  choices: ViewChoices,
): void {
  const { state: scroll } = useScrollState();
  const { state: zoom } = useZoom(DOCUMENT_ID);
  const { currentPage: page, pageCount } = navigation;
  const { canGoBack, canGoForward } = navigation;
  const zoomPercent = Math.round(zoom.currentZoomLevel * 100);
  const fit = fitMode(zoom.zoomLevel);
  const metric =
    choices.scrollMode === "paged"
      ? scroll.pageVisibilityMetrics.find(
          (metric) => metric.pageNumber === page,
        )
      : scroll.pageVisibilityMetrics[0];
  const readingPage = metric?.pageNumber ?? page;
  const choice: ZoomChoice =
    fit === "width"
      ? "fitWidth"
      : fit === "page"
        ? "fitPage"
        : zoom.currentZoomLevel * 100;
  const top = Math.max(
    0,
    (metric?.original.pageY ?? 0) - PAGE_GAP / zoom.currentZoomLevel,
  );
  const left = Math.max(
    0,
    (metric?.original.pageX ?? 0) - PAGE_GAP / zoom.currentZoomLevel,
  );
  const { pageLayout, scrollMode, scrollDirection } = choices;
  const ready = scroll.virtualItems.length > 0;
  useEffect(() => {
    // Before the layout is ready there is no page yet.
    if (!ready || pageCount < 1 || page < 1 || zoomPercent <= 0) return;
    const view = {
      page,
      pageCount,
      zoomPercent,
      fit,
      tool,
      pageLayout,
      scrollMode,
      scrollDirection,
      canGoBack,
      canGoForward,
      readingPage,
      zoom: choice,
      top,
      left,
    };
    rememberPosition(positionFromView(view));
    reportToHost({ view });
  }, [
    page,
    pageCount,
    zoomPercent,
    fit,
    tool,
    pageLayout,
    scrollMode,
    scrollDirection,
    canGoBack,
    canGoForward,
    readingPage,
    choice,
    top,
    left,
    ready,
  ]);
}

/**
 * Carry out what the extension's commands ask: page, zoom, find or tool.
 * Returns a stable function, so the host listener need not be re-attached.
 */
export function useViewActions(
  navigation: Navigation,
  openSearch: () => void,
  setTool: (tool: ToolMode) => void,
  setChoices: (choices: Partial<ViewChoices>) => void,
): (action: ViewerAction) => void {
  const { provides: zoom, state } = useZoom(DOCUMENT_ID);
  const latest = useRef({
    navigation,
    openSearch,
    setTool,
    setChoices,
    zoom,
    level: state.currentZoomLevel,
  });
  latest.current = {
    navigation,
    openSearch,
    setTool,
    setChoices,
    zoom,
    level: state.currentZoomLevel,
  };
  // Quick zoom repeats add up before React receives the native state change.
  const requested = useRef<number | undefined>(undefined);
  useEffect(() => {
    requested.current = undefined;
  }, [state.currentZoomLevel]);
  return useCallback((action: ViewerAction): void => {
    const { navigation, openSearch, setTool, setChoices, zoom, level } =
      latest.current;
    const generation = navigation.intent.advance();
    const from =
      requested.current ?? zoom?.getState().currentZoomLevel ?? level;
    const zoomTo = (next: number): void => {
      requested.current = Math.min(
        ZOOM_RANGE.max,
        Math.max(ZOOM_RANGE.min, next),
      );
      zoom?.requestZoom(requested.current);
    };
    switch (action.action) {
      case "previousPage":
        navigation.step(-1);
        break;
      case "nextPage":
        navigation.step(1);
        break;
      case "previousPageKeepingPlace":
        navigation.step(-1, true);
        break;
      case "nextPageKeepingPlace":
        navigation.step(1, true);
        break;
      case "goToPage":
        navigation.goToPage(action.page);
        break;
      case "zoomIn":
        zoomTo(nextZoomStep(from, 1));
        break;
      case "zoomOut":
        zoomTo(nextZoomStep(from, -1));
        break;
      case "setZoom":
        zoomTo(action.percent / 100);
        break;
      case "fitWidth":
        requested.current = undefined;
        zoom?.requestZoom(ZoomMode.FitWidth);
        break;
      case "fitPage": {
        requested.current = undefined;
        // Fitting a page keeps the reader on it: the zoom change alone would
        // keep the old vertical centre, which can land on a later page.
        const page = navigation.currentPage;
        zoom?.requestZoom(ZoomMode.FitPage);
        requestAnimationFrame(() => {
          if (navigation.intent.owns(generation)) latest.current.navigation.show({ page });
        });
        break;
      }
      case "actualSize":
        zoomTo(1);
        break;
      case "setPageLayout":
        setChoices({ pageLayout: action.pageLayout });
        break;
      case "setScrollMode":
        navigation.show({ page: navigation.currentPage });
        setChoices({ scrollMode: action.scrollMode });
        break;
      case "setScrollDirection":
        setChoices({ scrollDirection: action.scrollDirection });
        break;
      case "find":
        openSearch();
        break;
      case "setTool":
        setTool(action.tool);
        break;
    }
  }, []);
}

export function fitMode(level: unknown): FitMode | null {
  if (level === ZoomMode.FitWidth) return "width";
  if (level === ZoomMode.FitPage) return "page";
  return null;
}
