import { useScroll, useScrollCapability } from '@embedpdf/plugin-scroll/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fromViewRect, type PageRect } from '../shared/geometry';
import type { PdfLocation } from '../shared/pdf-location';

/** A box flashed on a page after opening a location. */
export interface Highlight {
  page: number;
  rect: PageRect;
  /** Changes on every request, so the same box can flash again. */
  key: number;
}

/** Where a requested box lands, in percent of the viewport height. */
const BOX_POSITION_PERCENT = 20;

/**
 * Where the reader is (current page) and how to move: to a page, to a
 * location with a box, or one page forward/back.
 *
 * When the layout is first ready, EmbedPDF scrolls to its own saved position,
 * overriding any earlier scroll. A location requested before then (a link
 * opened together with the PDF) is held and applied at that moment.
 */
export function useNavigation(documentId: string) {
  const { provides: scroll, state } = useScroll(documentId);
  const { provides: scrollPlugin } = useScrollCapability();
  const [highlight, setHighlight] = useState<Highlight>();
  const layoutReady = useRef(false);
  const heldLocation = useRef<PdfLocation | undefined>(undefined);

  const show = useCallback((location: PdfLocation): void => {
    if (!scroll || !layoutReady.current) {
      heldLocation.current = location;
      return;
    }
    const box = location.viewRect;
    scroll.scrollToPage({
      pageNumber: location.page,
      behavior: 'instant',
      ...(box ? { pageCoordinates: { x: box.left, y: box.top }, alignX: 0, alignY: BOX_POSITION_PERCENT } : {}),
    });
    if (box) setHighlight({ page: location.page, rect: fromViewRect(box), key: Date.now() });
  }, [scroll]);

  const showRef = useRef(show);
  showRef.current = show;
  useEffect(() => scrollPlugin?.onLayoutReady(event => {
    if (event.documentId !== documentId) return;
    layoutReady.current = true;
    const location = heldLocation.current;
    heldLocation.current = undefined;
    if (location) showRef.current(location);
  }), [documentId, scrollPlugin]);

  // The scroll capability can arrive after the layout; apply what was held.
  useEffect(() => {
    const location = heldLocation.current;
    if (scroll && layoutReady.current && location) {
      heldLocation.current = undefined;
      show(location);
    }
  }, [scroll, show]);

  return {
    currentPage: state.currentPage,
    pageCount: state.totalPages,
    highlight,
    show,
    goToPage: (page: number) => show({ page: Math.min(Math.max(1, page), state.totalPages) }),
    step: (delta: 1 | -1) => show({ page: Math.min(Math.max(1, state.currentPage + delta), state.totalPages) }),
  };
}

export type Navigation = ReturnType<typeof useNavigation>;
