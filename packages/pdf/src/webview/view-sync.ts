import { useScrollState } from "./scroll-state";
import { ZoomMode, useZoom } from "@embedpdf/plugin-zoom/react";
import { useCallback, useEffect, useRef } from "react";
import type { AnnotationToolId } from "../shared/annotation-tools";
import type {
  FitMode,
  ToolMode,
  ViewerAction,
  ViewState,
} from "../shared/view-state";
import type { ViewChoices } from "../shared/view-settings";
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
  annotation?: {
    annotationTool: AnnotationToolId | null;
    canUndo: boolean;
    canRedo: boolean;
  },
): void {
  const { state: scroll } = useScrollState();
  const { state: zoom } = useZoom(DOCUMENT_ID);
  const view = currentView({
    navigation,
    tool,
    choices,
    scroll,
    zoom,
    ...(annotation ? { annotation } : {}),
  });
  const latest = useRef(view);
  latest.current = view;
  // Report each distinct view once.
  const key = view && JSON.stringify(view);
  useEffect(() => {
    const view = latest.current;
    if (view) {
      rememberPosition(positionFromView(view));
      reportToHost({ view });
    }
  }, [key]);
}

/** The view to report, once the layout has a page; undefined before. */
function currentView(state: {
  navigation: Navigation;
  tool: ToolMode;
  choices: ViewChoices;
  scroll: ReturnType<typeof useScrollState>["state"];
  zoom: ReturnType<typeof useZoom>["state"];
  annotation?: {
    annotationTool: AnnotationToolId | null;
    canUndo: boolean;
    canRedo: boolean;
  };
}): ViewState | undefined {
  const { navigation, tool, choices, scroll, zoom, annotation } = state;
  const { currentPage: page, pageCount, canGoBack, canGoForward } = navigation;
  const zoomPercent = Math.round(zoom.currentZoomLevel * 100);
  if (
    !scroll.virtualItems.length ||
    pageCount < 1 ||
    page < 1 ||
    zoomPercent <= 0
  ) {
    return undefined;
  }
  const fit = fitMode(zoom.zoomLevel);
  const metric =
    choices.scrollMode === "paged"
      ? scroll.pageVisibilityMetrics.find(
          (metric) => metric.pageNumber === page,
        )
      : scroll.pageVisibilityMetrics[0];
  const inset = PAGE_GAP / zoom.currentZoomLevel;
  return {
    page,
    pageCount,
    zoomPercent,
    fit,
    tool,
    pageLayout: choices.pageLayout,
    scrollMode: choices.scrollMode,
    scrollDirection: choices.scrollDirection,
    canGoBack,
    canGoForward,
    readingPage: metric?.pageNumber ?? page,
    zoom: fit ? FIT_CHOICES[fit] : zoom.currentZoomLevel * 100,
    top: Math.max(0, (metric?.original.pageY ?? 0) - inset),
    left: Math.max(0, (metric?.original.pageX ?? 0) - inset),
    ...(tool === "annotate" && annotation
      ? {
          annotationTool: annotation.annotationTool,
          canAnnotationUndo: annotation.canUndo,
          canAnnotationRedo: annotation.canRedo,
        }
      : {}),
  };
}

/** What an action works with. */
interface ActionContext {
  navigation: Navigation;
  openSearch: () => void;
  setTool: (tool: ToolMode) => void;
  setAnnotationTool: (tool: AnnotationToolId | null) => void;
  setAnnotationColor: (color: string) => void;
  annotationUndo: () => void;
  annotationRedo: () => void;
  deleteSelectedAnnotations: () => void;
  setChoices: (choices: Partial<ViewChoices>) => void;
  /** Zoom to a level, within the viewer's range. */
  zoomTo: (level: number) => void;
  /** Zoom to a fit mode. */
  fit: (mode: ZoomMode) => void;
  /** The level zoom steps go from: the one asked for last, else the shown one. */
  from: number;
  /** The navigation generation this action started. */
  generation: number;
  /** The latest navigation, after this action's own updates. */
  latest: () => Navigation;
}

type Handlers = {
  [K in ViewerAction["action"]]: (
    action: Extract<ViewerAction, { action: K }>,
    context: ActionContext,
  ) => void;
};

/** What each of the extension's commands does in the viewer. */
const ACTIONS: Handlers = {
  previousPage: (_, { navigation }) => navigation.step(-1),
  nextPage: (_, { navigation }) => navigation.step(1),
  previousPageKeepingPlace: (_, { navigation }) => navigation.step(-1, true),
  nextPageKeepingPlace: (_, { navigation }) => navigation.step(1, true),
  goToPage: ({ page }, { navigation }) => navigation.goToPage(page),
  zoomIn: (_, { zoomTo, from }) => zoomTo(nextZoomStep(from, 1)),
  zoomOut: (_, { zoomTo, from }) => zoomTo(nextZoomStep(from, -1)),
  setZoom: ({ percent }, { zoomTo }) => zoomTo(percent / 100),
  actualSize: (_, { zoomTo }) => zoomTo(1),
  fitWidth: (_, { fit }) => fit(ZoomMode.FitWidth),
  fitPage: (_, { navigation, fit, generation, latest }) => {
    // Fitting a page keeps the reader on it: the zoom change alone would
    // keep the old vertical centre, which can land on a later page.
    const page = navigation.currentPage;
    fit(ZoomMode.FitPage);
    requestAnimationFrame(() => {
      if (navigation.intent.owns(generation)) {
        latest().show({ page });
      }
    });
  },
  setPageLayout: ({ pageLayout }, { setChoices }) => setChoices({ pageLayout }),
  setScrollMode: ({ scrollMode }, { navigation, setChoices }) => {
    navigation.show({ page: navigation.currentPage });
    setChoices({ scrollMode });
  },
  setScrollDirection: ({ scrollDirection }, { setChoices }) =>
    setChoices({ scrollDirection }),
  find: (_, { openSearch }) => openSearch(),
  setTool: ({ tool }, { setTool }) => setTool(tool),
  setAnnotationTool: ({ tool }, { setAnnotationTool }) =>
    setAnnotationTool(tool),
  setAnnotationColor: ({ color }, { setAnnotationColor }) =>
    setAnnotationColor(color),
  annotationUndo: (_, { annotationUndo }) => annotationUndo(),
  annotationRedo: (_, { annotationRedo }) => annotationRedo(),
  deleteSelectedAnnotations: (_, { deleteSelectedAnnotations }) =>
    deleteSelectedAnnotations(),
};

/**
 * Carry out what the extension's commands ask: page, zoom, find or tool.
 * Returns a stable function, so the host listener need not be re-attached.
 */
export function useViewActions(
  navigation: Navigation,
  openSearch: () => void,
  setTool: (tool: ToolMode) => void,
  options: {
    setChoices: (choices: Partial<ViewChoices>) => void;
    setAnnotationTool: (tool: AnnotationToolId | null) => void;
    setColor: (color: string) => void;
    undo: () => void;
    redo: () => void;
    deleteSelectedAnnotations: () => void;
  },
): (action: ViewerAction) => void {
  const { provides: zoom, state } = useZoom(DOCUMENT_ID);
  const current = {
    navigation,
    openSearch,
    setTool,
    setAnnotationTool: options.setAnnotationTool,
    setAnnotationColor: options.setColor,
    annotationUndo: options.undo,
    annotationRedo: options.redo,
    deleteSelectedAnnotations: options.deleteSelectedAnnotations,
    setChoices: options.setChoices,
    zoom,
    level: state.currentZoomLevel,
  };
  const latest = useRef(current);
  latest.current = current;
  // Quick zoom repeats add up before React receives the native state change.
  const requested = useRef<number | undefined>(undefined);
  useEffect(() => {
    requested.current = undefined;
  }, [state.currentZoomLevel]);
  return useCallback((action: ViewerAction): void => {
    const { navigation, zoom, level } = latest.current;
    const generation =
      action.action === "find"
        ? navigation.intent.advance()
        : navigation.intent.interrupt();
    const context: ActionContext = {
      ...latest.current,
      generation,
      from: requested.current ?? zoom?.getState().currentZoomLevel ?? level,
      zoomTo: (next) => {
        requested.current = Math.min(
          ZOOM_RANGE.max,
          Math.max(ZOOM_RANGE.min, next),
        );
        zoom?.requestZoom(requested.current);
      },
      fit: (mode) => {
        requested.current = undefined;
        zoom?.requestZoom(mode);
      },
      latest: () => latest.current.navigation,
    };
    (ACTIONS[action.action] as (a: ViewerAction, c: ActionContext) => void)(
      action,
      context,
    );
  }, []);
}

export function fitMode(level: unknown): FitMode | null {
  if (level === ZoomMode.FitWidth) {
    return "width";
  }
  if (level === ZoomMode.FitPage) {
    return "page";
  }
  return null;
}

/** The zoom choice for each fit mode. */
const FIT_CHOICES = { width: "fitWidth", page: "fitPage" } as const;
