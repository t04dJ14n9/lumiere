import { useScrollState } from "./scroll-state";
import { useScrollCapability } from "@embedpdf/plugin-scroll/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fromViewRect, type PageRect } from "../shared/geometry";
import type { PdfLocation } from "../shared/pdf-location";
import type { ReadingPosition } from "../shared/reading-position";
import type { ScrollMode } from "../shared/view-settings";
import { rememberedPosition } from "./reading-position";

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
export function useNavigation(
  documentId: string,
  scrollMode: ScrollMode,
  smooth: boolean,
) {
  const { provides: scroll, state } = useScrollState();
  const { provides: scrollPlugin } = useScrollCapability();
  const [highlight, setHighlight] = useState<Highlight>();
  const [pagedPage, setPagedPage] = useState(() => rememberedPosition().page);
  const requestedPage = useRef(pagedPage);
  useEffect(() => {
    if (scrollMode === "continuous") {
      requestedPage.current = state.currentPage;
      setPagedPage(state.currentPage);
    }
  }, [state.currentPage, scrollMode]);
  const layoutReady = useRef(false);
  const heldLocation = useRef<
    | {
        location: PdfLocation;
        top?: number | undefined;
        left: number;
        instant: boolean;
      }
    | undefined
  >(undefined);

  /**
   * Show a location: its box near the top of the viewer, flashed; without a
   * box, the page from `top` points below its top (where a link or outline
   * entry points), or from its top.
   */
  const show = useCallback(
    (location: PdfLocation, top?: number, left = 0, instant = false): void => {
      if (!scroll || !layoutReady.current) {
        heldLocation.current = { location, top, left, instant };
        return;
      }
      const page = Math.min(Math.max(1, location.page), scroll.getTotalPages());
      requestedPage.current = page;
      setPagedPage(page);
      const box = location.viewRect;
      // A page-only jump shows its whole native spread, including when the
      // requested page is on the right. Coordinate destinations keep that page.
      const item = scroll
        .getLayout()
        .virtualItems.find((item) => item.pageNumbers.includes(page));
      scroll.scrollToPage({
        pageNumber: box || top || left ? page : (item?.pageNumbers[0] ?? page),
        behavior:
          smooth && !instant && scrollMode === "continuous"
            ? "smooth"
            : "instant",
        ...(box
          ? {
              pageCoordinates: { x: box.left, y: box.top },
              alignX: 0,
              alignY: BOX_POSITION_PERCENT,
            }
          : top || left
            ? {
                pageCoordinates: { x: left, y: top ?? 0 },
                alignX: 0,
                alignY: 0,
              }
            : {}),
      });
      if (box) setHighlight({ page, rect: fromViewRect(box), key: Date.now() });
    },
    [scroll, scrollMode, smooth],
  );

  const showRef = useRef(show);
  showRef.current = show;
  useEffect(
    () =>
      scrollPlugin?.onLayoutReady((event) => {
        if (event.documentId !== documentId) return;
        layoutReady.current = true;
        const held = heldLocation.current;
        heldLocation.current = undefined;
        if (held)
          showRef.current(held.location, held.top, held.left, held.instant);
      }),
    [documentId, scrollPlugin],
  );

  // The scroll capability can arrive after the layout; apply what was held.
  useEffect(() => {
    const held = heldLocation.current;
    if (scroll && layoutReady.current && held) {
      heldLocation.current = undefined;
      show(held.location, held.top, held.left, held.instant);
    }
  }, [scroll, show]);

  /** Scroll a box (a search match) to the middle of the viewer, without flashing it. */
  const reveal = useCallback(
    (page: number, [left, top, right, bottom]: PageRect): void => {
      requestedPage.current = page;
      setPagedPage(page);
      scroll?.scrollToPage({
        pageNumber: page,
        behavior: smooth && scrollMode === "continuous" ? "smooth" : "instant",
        pageCoordinates: { x: (left + right) / 2, y: (top + bottom) / 2 },
        alignX: 50,
        alignY: 50,
      });
    },
    [scroll, scrollMode, smooth],
  );

  const restore = useCallback((position: ReadingPosition): void => {
    showRef.current({ page: position.page }, position.top, position.left, true);
  }, []);
  const step = (delta: 1 | -1): void => {
    if (!scroll) return;
    // Native virtual items define both single-page and spread navigation.
    const items = scroll.getLayout().virtualItems;
    // Quick repeats add up: the page requested last, until scrolling reports another.
    const from = requestedPage.current;
    const index = items.findIndex((item) => item.pageNumbers.includes(from));
    const item = items[Math.min(Math.max(0, index + delta), items.length - 1)];
    if (item) show({ page: item.pageNumbers[0]! });
  };
  const currentPage = scrollMode === "paged" ? pagedPage : state.currentPage;
  const item = state.virtualItems.find((item) =>
    item.pageNumbers.includes(currentPage),
  );
  return {
    currentPage,
    pageCount: state.totalPages,
    canGoBack: Boolean(item && item !== state.virtualItems[0]),
    canGoForward: Boolean(item && item !== state.virtualItems.at(-1)),
    activePages:
      scrollMode === "paged" ? (item?.pageNumbers ?? [currentPage]) : undefined,
    highlight,
    show,
    restore,
    reveal,
    goToPage: (page: number, top?: number) => show({ page }, top),
    step,
  };
}

export type Navigation = ReturnType<typeof useNavigation>;
