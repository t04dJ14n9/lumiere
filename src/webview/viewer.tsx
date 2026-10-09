import type { PdfDocumentObject } from '@embedpdf/models';
import { Scroller } from '@embedpdf/plugin-scroll/react';
import { CopyToClipboard } from '@embedpdf/plugin-selection/react';
import { Viewport } from '@embedpdf/plugin-viewport/react';
import { ZoomGestureWrapper } from '@embedpdf/plugin-zoom/react';
import React, { useEffect, useRef, useState } from 'react';
import { listenToHost } from './host';
import { useNavigation } from './navigation';
import { useOutlinePublishing } from './outline';
import { Page } from './page';
import { DOCUMENT_ID } from './plugins';
import { SearchBar } from './search-bar';
import { useSelectionReporting } from './selection';
import { Toolbar } from './toolbar';

/** The open PDF: toolbar, optional search bar, and the scrolling pages. */
export function Viewer({ document: pdf }: { document: PdfDocumentObject }): React.JSX.Element {
  const navigation = useNavigation(DOCUMENT_ID);
  const selection = useSelectionReporting(DOCUMENT_ID);
  const devicePixelRatio = useDevicePixelRatio();
  const [searching, setSearching] = useState(false);
  /** Counts Find requests, so Find on an open search bar focuses it again. */
  const [findRequest, setFindRequest] = useState(0);
  const openSearch = (): void => {
    setSearching(true);
    setFindRequest(request => request + 1);
  };
  useOutlinePublishing(DOCUMENT_ID);

  const show = navigation.show;
  useEffect(() => listenToHost(message => {
    if (message.type === 'goTo') show(message.location);
  }), [show]);

  const latest = useRef({ selection, searching });
  latest.current = { selection, searching };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearching(true);
        setFindRequest(request => request + 1);
      } else if (event.key === 'Escape') {
        if (latest.current.searching) setSearching(false);
        else latest.current.selection.clearRegion();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="viewer">
      <CopyToClipboard />
      <Toolbar navigation={navigation} onSearch={openSearch} />
      <div className="document">
        {searching && <SearchBar navigation={navigation} focusRequest={findRequest} onClose={() => setSearching(false)} />}
        <Viewport documentId={DOCUMENT_ID} className="viewport">
          <ZoomGestureWrapper documentId={DOCUMENT_ID}>
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
                  onOpenPage={page => navigation.goToPage(page)}
                />
              )}
            />
          </ZoomGestureWrapper>
        </Viewport>
      </div>
    </div>
  );
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
