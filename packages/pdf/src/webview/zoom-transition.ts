import { useZoomCapability } from "@embedpdf/plugin-zoom/react";
import { useViewportPlugin } from "@embedpdf/plugin-viewport/react";
import { useEffect, useMemo, type RefObject } from "react";
import { MOTION_MS } from "../shared/smooth-motion";
import { DOCUMENT_ID, PAGE_GAP } from "./plugins";
import { useScrollState } from "./scroll-state";
import { isCommittingPinch } from "./zoom-gesture";

/** Animate displayed scale after EmbedPDF establishes its final fit mode and layout. */
export function useZoomTransition(
  container: RefObject<HTMLElement | null>,
  smooth: boolean,
): void {
  const { provides } = useZoomCapability();
  const { plugin: viewport } = useViewportPlugin();
  const { provides: scroll } = useScrollState();
  const zoom = useMemo(
    () => provides?.forDocument(DOCUMENT_ID) ?? null,
    [provides],
  );
  useEffect(() => {
    const element = container.current;
    if (!smooth || !zoom || !scroll || !element) {
      return;
    }
    return new ZoomTransition(element, scroll).attach(zoom, viewport);
  }, [container, smooth, zoom, viewport, scroll]);
}

type DocumentZoom = NonNullable<
  ReturnType<
    NonNullable<ReturnType<typeof useZoomCapability>["provides"]>["forDocument"]
  >
>;
type ZoomChange = Parameters<Parameters<DocumentZoom["onZoomChange"]>[0]>[0];
type Scroll = NonNullable<ReturnType<typeof useScrollState>["provides"]>;
type ViewportPlugin = ReturnType<typeof useViewportPlugin>["plugin"];

/** Input that ends a running animation (zooming with the wheel keeps it). */
const INPUT_EVENTS = ["pointerdown", "touchstart", "keydown", "wheel"];

/** The zoom animation of one viewer element, for as long as it is attached. */
class ZoomTransition {
  private frame = 0;
  private watching = 0;
  private animation: Animation | undefined;
  private animatedElement: HTMLElement | undefined;
  /** The scroller's layout size, as of its last change. */
  private known = "";
  /** Starts the prepared animation, once the new layout is there. */
  private armed: (() => void) | undefined;
  /** A zoom change arrived after the scroll the zoom plugin asked for. */
  private zoomed = false;
  private readonly sizes = new ResizeObserver(() => this.onResize());

  constructor(
    private readonly element: HTMLElement,
    private readonly scroll: Scroll,
  ) {}

  attach(zoom: DocumentZoom, viewport: ViewportPlugin): () => void {
    const unsubscribe = zoom.onZoomChange((event) => this.onZoomChange(event));
    this.watch();
    // The zoom plugin asks for a scroll just before it reports its zoom change,
    // which carries on from the animation on screen: let it, or one frame would
    // show the old layout without the animation. Other scrolls end it.
    const stopOnScroll = viewport?.onScrollRequest(DOCUMENT_ID, () => {
      this.zoomed = false;
      queueMicrotask(() => {
        if (!this.zoomed) {
          this.cancel();
        }
      });
    });
    for (const type of INPUT_EVENTS) {
      this.element.addEventListener(type, this.cancelUnlessZoom, {
        capture: true,
      });
    }
    return () => {
      this.cancel();
      unsubscribe();
      cancelAnimationFrame(this.watching);
      this.sizes.disconnect();
      stopOnScroll?.();
      for (const type of INPUT_EVENTS) {
        this.element.removeEventListener(type, this.cancelUnlessZoom, {
          capture: true,
        });
      }
    };
  }

  private cancel(): void {
    this.armed = undefined;
    cancelAnimationFrame(this.frame);
    this.animation?.cancel();
    this.animation = undefined;
    if (this.animatedElement) {
      this.animatedElement.style.pointerEvents = "";
    }
    this.animatedElement = undefined;
  }

  private onZoomChange(event: ZoomChange): void {
    // A zoom that arrives mid-animation carries on from what is on screen,
    // not from the previous animation's end, which would jump.
    const target = this.animation ? this.animatedElement : undefined;
    const shown = target
      ? new DOMMatrix(getComputedStyle(target).transform)
      : undefined;
    this.zoomed = true;
    // A pinch has already shown this scale as it went.
    if (event.oldZoom === event.newZoom || isCommittingPinch()) {
      this.cancel();
      return;
    }
    // The running animation stays until the next one replaces it in the frame
    // that has the new layout: ending it now would show the old layout bare.
    this.armed = undefined;
    cancelAnimationFrame(this.frame);
    const viewBox = this.element
      .querySelector<HTMLElement>(".viewport")
      ?.getBoundingClientRect();
    const scroller = this.scroller();
    if (!viewBox || !scroller) {
      this.cancel();
      return;
    }
    const from = this.oldOrigin(event, viewBox, shown);
    let started = false;
    const start = (): void => {
      if (!started) {
        started = true;
        this.animate(scroller, event, from, shown?.a ?? 1);
      }
    };
    // Start the animation in the frame that has the new layout, before it is
    // painted: a ResizeObserver runs after layout and before paint, where a
    // requestAnimationFrame would let one frame show the final scale first.
    // The layout may already have changed (sync), change before paint (the
    // resize observer), or not change in size at all: start by then.
    this.armed = start;
    this.frame = requestAnimationFrame(() => requestAnimationFrame(start));
  }

  /** Where the content's top left corner was shown before this zoom. */
  private oldOrigin(
    event: ZoomChange,
    viewBox: DOMRect,
    shown: DOMMatrix | undefined,
  ): { left: number; top: number } {
    const size = this.scroll.getLayout().totalContentSize;
    const { viewport, oldZoom } = event;
    const centred = (room: number, extent: number) =>
      Math.max(0, (room - 2 * PAGE_GAP - extent * oldZoom) / 2);
    return {
      left:
        (shown?.e ?? 0) +
        viewBox.left +
        PAGE_GAP +
        centred(viewport.clientWidth, size.width) -
        viewport.scrollLeft,
      top:
        (shown?.f ?? 0) +
        viewBox.top +
        PAGE_GAP +
        centred(viewport.clientHeight, size.height) -
        viewport.scrollTop,
    };
  }

  /** Animate from the old scale and place to the new layout. */
  private animate(
    scroller: HTMLElement,
    event: ZoomChange,
    from: { left: number; top: number },
    shownScale: number,
  ): void {
    this.armed = undefined;
    this.cancel();
    const content = scroller.getBoundingClientRect();
    scroller.style.transformOrigin = "0 0";
    // Selection uses native final coordinates; settle the display before starting a new drag.
    this.animatedElement = scroller;
    scroller.style.pointerEvents = "none";
    const transition = scroller.animate(
      [
        {
          transform: `translate(${from.left - content.left}px, ${from.top - content.top}px) scale(${(event.oldZoom * shownScale) / event.newZoom})`,
        },
        { transform: "scale(1)" },
      ],
      { duration: MOTION_MS, easing: "ease-out" },
    );
    this.animation = transition;
    transition.onfinish = () => {
      if (this.animation !== transition) {
        return;
      }
      scroller.style.pointerEvents = "";
      this.animatedElement = undefined;
    };
  }

  /** A change of the scroller's size after a zoom is the new layout. */
  private onResize(): void {
    const scroller = this.scroller();
    const now = scroller
      ? `${scroller.offsetWidth}x${scroller.offsetHeight}`
      : "";
    const changed = now !== this.known;
    this.known = now;
    if (changed) {
      this.armed?.();
    }
  }

  /** The scroller appears once the document has a layout: watch it from then. */
  private watch(): void {
    const scroller = this.scroller();
    if (scroller) {
      this.sizes.observe(scroller);
    } else {
      this.watching = requestAnimationFrame(() => this.watch());
    }
  }

  private readonly cancelUnlessZoom = (event: Event): void => {
    if (event instanceof WheelEvent && (event.ctrlKey || event.metaKey)) {
      return;
    }
    this.cancel();
  };

  private scroller(): HTMLElement | null {
    return this.element.querySelector<HTMLElement>("[data-pdf-scroller]");
  }
}
