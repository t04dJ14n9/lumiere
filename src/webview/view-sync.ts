import { ZoomMode, useZoom } from '@embedpdf/plugin-zoom/react';
import { useCallback, useEffect, useRef } from 'react';
import type { FitMode, ToolMode, ViewerAction } from '../shared/view-state';
import { nextZoomStep } from '../shared/zoom-steps';
import { postToHost } from './host';
import type { Navigation } from './navigation';
import { DOCUMENT_ID, ZOOM_RANGE } from './plugins';

/**
 * Keep the extension's controls (status bar, editor title actions) in step
 * with the viewer: report the page, zoom and tool after each change.
 */
export function useViewReporting(navigation: Navigation, tool: ToolMode): void {
  const { state: zoom } = useZoom(DOCUMENT_ID);
  const { currentPage: page, pageCount } = navigation;
  const zoomPercent = Math.round(zoom.currentZoomLevel * 100);
  const fit = fitMode(zoom.zoomLevel);
  useEffect(() => {
    // Before the layout is ready there is no page yet.
    if (pageCount < 1 || page < 1 || zoomPercent <= 0) return;
    postToHost({ type: 'view', view: { page, pageCount, zoomPercent, fit, tool } });
  }, [page, pageCount, zoomPercent, fit, tool]);
}

/**
 * Carry out what the extension's commands ask: page, zoom, find or tool.
 * Returns a stable function, so the host listener need not be re-attached.
 */
export function useViewActions(
  navigation: Navigation,
  openSearch: () => void,
  setTool: (tool: ToolMode) => void,
): (action: ViewerAction) => void {
  const { provides: zoom, state } = useZoom(DOCUMENT_ID);
  const latest = useRef({ navigation, openSearch, setTool, zoom, level: state.currentZoomLevel });
  latest.current = { navigation, openSearch, setTool, zoom, level: state.currentZoomLevel };
  // The page and zoom last asked for, so quick repeats (a held key) add up
  // before the viewer has moved.
  const requested = useRef<number | undefined>(undefined);
  useEffect(() => {
    requested.current = undefined;
  }, [state.currentZoomLevel]);
  const requestedPage = useRef<number | undefined>(undefined);
  useEffect(() => {
    requestedPage.current = undefined;
  }, [navigation.currentPage]);

  return useCallback((action: ViewerAction): void => {
    const { navigation, openSearch, setTool, zoom, level } = latest.current;
    const zoomTo = (next: number): void => {
      requested.current = Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, next));
      zoom?.requestZoom(requested.current);
    };
    const step = (delta: 1 | -1): void => {
      const from = requestedPage.current ?? navigation.currentPage;
      requestedPage.current = Math.min(Math.max(1, from + delta), navigation.pageCount);
      navigation.goToPage(requestedPage.current);
    };
    switch (action.action) {
      case 'previousPage': step(-1); break;
      case 'nextPage': step(1); break;
      case 'goToPage': navigation.goToPage(action.page); break;
      case 'zoomIn': zoomTo(nextZoomStep(requested.current ?? level, 1)); break;
      case 'zoomOut': zoomTo(nextZoomStep(requested.current ?? level, -1)); break;
      case 'setZoom': zoomTo(action.percent / 100); break;
      case 'fitWidth': zoom?.requestZoom(ZoomMode.FitWidth); break;
      case 'fitPage': zoom?.requestZoom(ZoomMode.FitPage); break;
      case 'find': openSearch(); break;
      case 'setTool': setTool(action.tool); break;
    }
  }, []);
}

export function fitMode(level: unknown): FitMode | null {
  if (level === ZoomMode.FitWidth) return 'width';
  if (level === ZoomMode.FitPage) return 'page';
  return null;
}
