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
  const heldLocation = useRef<{ location: PdfLocation; top?: number | undefined } | undefined>(undefined);

  /**
   * Show a location: its box near the top of the viewer, flashed; without a
   * box, the page from `top` points below its top (where a link or outline
   * entry points), or from its top.
   */
  const show = useCallback((location: PdfLocation, top?: number): void => {
    if (!scroll || !layoutReady.current) {
      heldLocation.current = { location, top };
      return;
    }
    const box = location.viewRect;
    scroll.scrollToPage({
      pageNumber: location.page,
      behavior: 'instant',
      ...(box ? { pageCoordinates: { x: box.left, y: box.top }, alignX: 0, alignY: BOX_POSITION_PERCENT }
        : top ? { pageCoordinates: { x: 0, y: top }, alignX: 0, alignY: 0 } : {}),
    });
    if (box) setHighlight({ page: location.page, rect: fromViewRect(box), key: Date.now() });
  }, [scroll]);

  const showRef = useRef(show);
  showRef.current = show;
  useEffect(() => scrollPlugin?.onLayoutReady(event => {
    if (event.documentId !== documentId) return;
    layoutReady.current = true;
    const held = heldLocation.current;
    heldLocation.current = undefined;
    if (held) showRef.current(held.location, held.top);
  }), [documentId, scrollPlugin]);

  // The scroll capability can arrive after the layout; apply what was held.
  useEffect(() => {
    const held = heldLocation.current;
    if (scroll && layoutReady.current && held) {
      heldLocation.current = undefined;
      show(held.location, held.top);
    }
  }, [scroll, show]);

  /** Scroll a box (a search match) to the middle of the viewer, without flashing it. */
  const reveal = useCallback((page: number, [left, top, right, bottom]: PageRect): void => {
    scroll?.scrollToPage({
      pageNumber: page,
      behavior: 'instant',
      pageCoordinates: { x: (left + right) / 2, y: (top + bottom) / 2 },
      alignX: 50,
      alignY: 50,
    });
  }, [scroll]);

  return {
    currentPage: state.currentPage,
    pageCount: state.totalPages,
    highlight,
    show,
    reveal,
    goToPage: (page: number, top?: number) => show({ page: Math.min(Math.max(1, page), state.totalPages) }, top),
    step: (delta: 1 | -1) => show({ page: Math.min(Math.max(1, state.currentPage + delta), state.totalPages) }),
  };
}

export type Navigation = ReturnType<typeof useNavigation>;
