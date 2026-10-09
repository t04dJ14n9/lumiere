import type { PdfDocumentObject } from '@embedpdf/models';
import { Scroller, useScroll } from '@embedpdf/plugin-scroll/react';
import { CopyToClipboard } from '@embedpdf/plugin-selection/react';
import { Viewport } from '@embedpdf/plugin-viewport/react';
import { ZoomGestureWrapper, useZoom } from '@embedpdf/plugin-zoom/react';
import React, { useEffect, useRef, useState } from 'react';
import { parseViewerAction } from '../shared/view-state';
import { useEndDragsReleasedOutside } from './drag-release';
import { listenToHost } from './host';
import { useNavigation, type Navigation } from './navigation';
import { useOutlinePublishing } from './outline';
import { Page } from './page';
import { DOCUMENT_ID, PAGE_GAP } from './plugins';
import { rememberPosition, rememberedPosition } from './reading-position';
import { SearchBar } from './search-bar';
import { useIgnoreSecondaryButtons } from './secondary-buttons';
import { useSelectionReporting } from './selection';
import { useToolMode } from './tool-mode';
import { currentToolbarSettings, rememberToolbarSettings } from './toolbar-settings';
import { Toolbar } from './toolbar';
import { useViewActions, useViewReporting } from './view-sync';
import { useWheelZoom } from './wheel-zoom';

/**
 * The open PDF: the toolbar (unless the controls are in VS Code's own UI or
 * hidden), an optional search bar, and the scrolling pages.
 */
export function Viewer({ document: pdf }: { document: PdfDocumentObject }): React.JSX.Element {
  const navigation = useNavigation(DOCUMENT_ID);
  const selection = useSelectionReporting(DOCUMENT_ID, pdf);
  const devicePixelRatio = useDevicePixelRatio();
  const [searching, setSearching] = useState(false);
  /** Counts Find requests, so Find on an open search bar focuses it again. */
  const [findRequest, setFindRequest] = useState(0);
  const openSearch = (): void => {
    setSearching(true);
    setFindRequest(request => request + 1);
  };
  useOutlinePublishing(DOCUMENT_ID, pdf);
  const documentArea = useRef<HTMLDivElement>(null);
  useWheelZoom(documentArea);
  useEndDragsReleasedOutside();
  useIgnoreSecondaryButtons(documentArea);

  const show = navigation.show;
  useKeepReadingPosition(pdf, show);

  const [toolbar, setToolbar] = useState(currentToolbarSettings);
  const { tool, setTool } = useToolMode(DOCUMENT_ID);
  useViewReporting(navigation, tool);
  const runAction = useViewActions(navigation, openSearch, setTool);
  useEffect(() => listenToHost(message => {
    if (message.type === 'goTo') show(message.location, message.top);
    else if (message.type === 'action') {
      const action = parseViewerAction(message.action);
      if (action) runAction(action);
    } else if (message.type === 'toolbar') {
      setToolbar(rememberToolbarSettings(message.toolbar));
    }
  }), [show, runAction]);

  const latest = useRef({ selection, searching, tool, setTool });
  latest.current = { selection, searching, tool, setTool };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearching(true);
        setFindRequest(request => request + 1);
      } else if (event.key === 'Escape') {
        const { searching, selection, tool, setTool } = latest.current;
        if (searching) setSearching(false);
        // With nothing selected, Escape puts down the Select Region tool.
        else if (tool === 'region' && !selection.region) setTool('text');
        else selection.clear();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className={`viewer tool-${tool} toolbar-${toolbar.mode}`}>
      <CopyToClipboard />
      {toolbar.mode === 'slim' && <Toolbar navigation={navigation} tool={tool} run={runAction} />}
      <div className="document" ref={documentArea}>
        {searching && <SearchBar navigation={navigation} focusRequest={findRequest} onClose={() => setSearching(false)} />}
        <Viewport documentId={DOCUMENT_ID} className="viewport">
          <ZoomGestureWrapper documentId={DOCUMENT_ID} enableWheel={false}>
            <Scroller
              documentId={DOCUMENT_ID}
              renderPage={({ pageIndex, width, height }) => (
                <Page
                  pdf={pdf}
                  pageIndex={pageIndex}
                  width={width}
                  height={height}
                  devicePixelRatio={devicePixelRatio}
                  highlight={navigation.highlight}
                  region={selection.region}
                  selection={selection}
                  onOpenPage={(page, top) => navigation.goToPage(page, top)}
                />
              )}
            />
          </ZoomGestureWrapper>
        </Viewport>
      </div>
    </div>
  );
}

/**
 * Reopen at the previous viewer's position (the file was reloaded), then
 * keep the position up to date for the next reload.
 */
function useKeepReadingPosition(pdf: PdfDocumentObject, show: Navigation['show']): void {
  const { provides: scroll } = useScroll(DOCUMENT_ID);
  const { provides: zoomScope, state: zoom } = useZoom(DOCUMENT_ID);
  // Restore the zoom first, then the place: zooming moves the pages.
  const restoring = useRef(rememberedPosition());
  useEffect(() => {
    const previous = restoring.current;
    if (previous && zoomScope && zoom.zoomLevel !== previous.zoom) zoomScope.requestZoom(previous.zoom);
  }, [zoomScope, zoom.zoomLevel]);
  useEffect(() => {
    const previous = restoring.current;
    if (!previous || zoom.zoomLevel !== previous.zoom) return;
    restoring.current = undefined;
    show({ page: Math.min(previous.page, pdf.pages.length) }, previous.top);
  }, [pdf, show, zoom.zoomLevel]);

  const zoomLevel = useRef(zoom.zoomLevel);
  zoomLevel.current = zoom.zoomLevel;
  const place = useRef<{ page: number; top: number } | undefined>(undefined);
  useEffect(() => scroll?.onScroll(metrics => {
    // The topmost visible page, and how far down it the viewer starts.
    const first = metrics.pageVisibilityMetrics[0];
    // Until restored, the old position stands (the file may change again).
    if (!first || restoring.current) return;
    // EmbedPDF measures from the outer edge of the viewport's padding.
    place.current = { page: first.pageNumber, top: Math.max(0, first.original.pageY - PAGE_GAP / first.scaled.scale) };
    rememberPosition({ ...place.current, zoom: zoomLevel.current });
  }), [scroll]);
  useEffect(() => {
    if (place.current && !restoring.current) rememberPosition({ ...place.current, zoom: zoom.zoomLevel });
  }, [zoom.zoomLevel]);
}

/** The screen's pixel ratio, updated when the window moves to another display. */
function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    const query = window.matchMedia(`(resolution: ${ratio}dppx)`);
    const update = (): void => setRatio(window.devicePixelRatio || 1);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [ratio]);
  return ratio;
}
