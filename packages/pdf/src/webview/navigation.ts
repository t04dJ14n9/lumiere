import { useScrollState } from "./scroll-state";
import { useScrollCapability } from "@embedpdf/plugin-scroll/react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fromViewRect, type PageRect } from "../shared/geometry";
import type { PdfLocation } from "../shared/pdf-location";
import type { ReadingPosition } from "../shared/reading-position";
import type { ScrollMode } from "../shared/view-settings";
import { rememberedPosition } from "./reading-position";
import { NavigationIntent } from "../shared/navigation-intent";

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
  const intent = useRef(new NavigationIntent()).current;
  const { provides: scroll, state } = useScrollState();
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
  const heldLocation = useRef<HeldLocation | undefined>(undefined);
  const animate = smooth && scrollMode === "continuous";

  /**
   * Show a location: its box near the top of the viewer, flashed; without a
   * box, the page from `top` points below its top (where a link or outline
   * entry points), or from its top.
   */
  const show = useCallback(
    (location: PdfLocation, top?: number, left = 0, instant = false): void => {
      if (!scroll || !layoutReady.current) {
        const generation = intent.current();
        heldLocation.current = { location, top, left, instant, generation };
        return;
      }
      const page = Math.min(Math.max(1, location.page), scroll.getTotalPages());
      requestedPage.current = page;
      setPagedPage(page);
      scroll.scrollToPage({
        ...scrollTarget(scroll, { ...location, page }, top, left),
        behavior: animate && !instant ? "smooth" : "instant",
      });
      if (location.viewRect) {
        const rect = fromViewRect(location.viewRect);
        setHighlight({ page, rect, key: Date.now() });
      }
    },
    [scroll, animate, intent],
  );
  const showRef = useRef(show);
  showRef.current = show;
  useHeldLocation({
    documentId,
    scroll,
    intent,
    layoutReady,
    heldLocation,
    show,
  });
  useNavigationInterrupts(intent, heldLocation);

  /** Scroll a box (a search match) to the middle of the viewer, without flashing it. */
  const reveal = useCallback(
    (page: number, rect: PageRect, _deliberate = true): void => {
      requestedPage.current = page;
      setPagedPage(page);
      const [left, top, right, bottom] = rect;
      scroll?.scrollToPage({
        pageNumber: page,
        behavior: animate ? "smooth" : "instant",
        pageCoordinates: { x: (left + right) / 2, y: (top + bottom) / 2 },
        alignX: 50,
        alignY: 50,
      });
    },
    [scroll, animate],
  );
  const restore = useCallback(
    (position: ReadingPosition): void => {
      intent.advance();
      showRef.current(
        { page: position.page },
        position.top,
        position.left,
        true,
      );
    },
    [intent],
  );
  const currentPage = scrollMode === "paged" ? pagedPage : state.currentPage;
  const item = state.virtualItems.find((item) =>
    item.pageNumbers.includes(currentPage),
  );
  return {
    intent,
    isReady: () => layoutReady.current && Boolean(scroll),
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
    step: (delta: 1 | -1, keepPlace = false): void =>
      step(scroll, requestedPage.current, show, { delta, keepPlace }),
  };
}

type Scroll = NonNullable<ReturnType<typeof useScrollState>["provides"]>;
type Show = (
  location: PdfLocation,
  top?: number,
  left?: number,
  instant?: boolean,
) => void;

/** A location asked for before the layout was ready. */
interface HeldLocation {
  location: PdfLocation;
  top?: number | undefined;
  left: number;
  instant: boolean;
  generation: number;
}

/** Where `scrollToPage` takes a location, apart from how it moves there. */
function scrollTarget(
  scroll: Scroll,
  location: PdfLocation,
  top: number | undefined,
  left: number,
) {
  const { page, viewRect: box } = location;
  if (box) {
    return {
      pageNumber: page,
      pageCoordinates: { x: box.left, y: box.top },
      alignX: 0,
      alignY: BOX_POSITION_PERCENT,
    };
  }
  if (top !== undefined || left !== 0) {
    return {
      pageNumber: page,
      pageCoordinates: { x: left, y: top ?? 0 },
      alignX: 0,
      alignY: 0,
    };
  }
  // A page-only jump shows its whole native spread, including when the
  // requested page is on the right. Coordinate destinations keep that page.
  const item = scroll
    .getLayout()
    .virtualItems.find((item) => item.pageNumbers.includes(page));
  return { pageNumber: item?.pageNumbers[0] ?? page };
}

/** Show a location held until the layout (and the scroll capability) is ready. */
function useHeldLocation(options: {
  documentId: string;
  scroll: Scroll | null | undefined;
  intent: NavigationIntent;
  layoutReady: React.MutableRefObject<boolean>;
  heldLocation: React.MutableRefObject<HeldLocation | undefined>;
  show: Show;
}): void {
  const { documentId, scroll, intent, layoutReady, heldLocation, show } =
    options;
  const { provides: scrollPlugin } = useScrollCapability();
  const showRef = useRef(show);
  showRef.current = show;
  const applyHeld = useCallback(() => {
    const held = heldLocation.current;
    heldLocation.current = undefined;
    if (held && intent.owns(held.generation)) {
      showRef.current(held.location, held.top, held.left, held.instant);
    }
  }, [heldLocation, intent]);
  useEffect(
    () =>
      scrollPlugin?.onLayoutReady((event) => {
        if (event.documentId === documentId) {
          layoutReady.current = true;
          applyHeld();
        }
      }),
    [documentId, scrollPlugin, layoutReady, applyHeld],
  );
  // The scroll capability can arrive after the layout; apply what was held.
  useEffect(() => {
    if (scroll && layoutReady.current && heldLocation.current) {
      applyHeld();
    }
  }, [scroll, show, layoutReady, heldLocation, applyHeld]);
}

/** Keys that move the reader through the PDF; other keys do not interrupt. */
const NAVIGATION_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "Escape",
];

/** Elements whose keys belong to them, not to reading. */
const OWN_KEYS =
  'input, textarea, select, [contenteditable], [role="slider"], [role="spinbutton"], [role="listbox"], [role="menu"], [role="combobox"], .view-menu, .grip';

const INTERRUPTING_EVENTS = ["wheel", "pointerdown", "touchstart", "keydown"];

/**
 * The reader's own input ends whatever navigation is in flight: reading
 * input (scrolling the pages, arrow keys) interrupts it as reader movement,
 * anything else (the toolbar, the search field) just supersedes it.
 */
function useNavigationInterrupts(
  intent: NavigationIntent,
  heldLocation: React.MutableRefObject<HeldLocation | undefined>,
): void {
  useEffect(() => {
    const interrupt = (event: Event): void => {
      if (
        event instanceof KeyboardEvent &&
        !NAVIGATION_KEYS.includes(event.key)
      ) {
        return;
      }
      if (isReadingInput(event)) {
        intent.interrupt();
      } else {
        intent.advance();
      }
      heldLocation.current = undefined;
    };
    for (const name of INTERRUPTING_EVENTS) {
      document.addEventListener(name, interrupt, {
        capture: true,
        passive: true,
      });
    }
    return () => {
      intent.advance();
      for (const name of INTERRUPTING_EVENTS) {
        document.removeEventListener(name, interrupt, true);
      }
    };
  }, [intent, heldLocation]);
}

function isReadingInput(event: Event): boolean {
  const target = event.target instanceof Element ? event.target : undefined;
  if (!(event instanceof KeyboardEvent)) {
    return Boolean(target?.closest(".viewport"));
  }
  const modified =
    event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
  return event.key !== "Escape" && !modified && !target?.closest(OWN_KEYS);
}

/** One page (or spread) forward or back; with `keepPlace`, at the same place in it. */
function step(
  scroll: Scroll | null | undefined,
  from: number,
  show: Show,
  move: { delta: 1 | -1; keepPlace: boolean },
): void {
  if (!scroll) {
    return;
  }
  // Native virtual items define both single-page and spread navigation.
  const items = scroll.getLayout().virtualItems;
  // Quick repeats add up: from the page requested last, until scrolling reports another.
  const index = items.findIndex((item) => item.pageNumbers.includes(from));
  const item =
    items[Math.min(Math.max(0, index + move.delta), items.length - 1)];
  if (!item) {
    return;
  }
  const place = move.keepPlace
    ? placeInPage(items[index]?.pageNumbers[0])
    : undefined;
  if (place) {
    show({ page: item.pageNumbers[0]! }, place.top, place.left);
  } else {
    show({ page: item.pageNumbers[0]! });
  }
}

/**
 * How far into a page the viewer's top-left corner is, in points: turning
 * the page with this keeps the zoom and the place in the page, as Preview's
 * Option+Arrow does. Nothing when the page's top is still below the corner.
 */
function placeInPage(
  page: number | undefined,
): { top: number; left: number } | undefined {
  const viewport = document.querySelector(".viewport");
  const element = document.querySelector<HTMLElement>(
    `.page[data-page-index="${(page ?? 1) - 1}"]`,
  );
  const scale = Number(element?.dataset.scale);
  if (!viewport || !element || !(scale > 0)) {
    return undefined;
  }
  const view = viewport.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  const top = Math.max(0, view.top - box.top) / scale;
  const left = Math.max(0, view.left - box.left) / scale;
  return top || left ? { top, left } : undefined;
}

export type Navigation = ReturnType<typeof useNavigation>;
