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
    if (!smooth || !zoom || !scroll || !element) return;
    let frame = 0;
    let animation: Animation | undefined;
    let animatedElement: HTMLElement | undefined;
    let known = "";
    let armed: (() => void) | undefined;
    const cancel = (): void => {
      armed = undefined;
      cancelAnimationFrame(frame);
      animation?.cancel();
      animation = undefined;
      if (animatedElement) animatedElement.style.pointerEvents = "";
      animatedElement = undefined;
    };
    const unsubscribe = zoom.onZoomChange((event) => {
      // A zoom that arrives mid-animation carries on from what is on screen,
      // not from the previous animation's end, which would jump.
      const target = animation ? animatedElement : undefined;
      const shown = target
        ? new DOMMatrix(getComputedStyle(target).transform)
        : undefined;
      zoomed = true;
      // A pinch has already shown this scale as it went.
      if (event.oldZoom === event.newZoom || isCommittingPinch()) {
        cancel();
        return;
      }
      // The running animation stays until the next one replaces it in the frame
      // that has the new layout: ending it now would show the old layout bare.
      armed = undefined;
      cancelAnimationFrame(frame);
      const viewBox = element
        .querySelector<HTMLElement>(".viewport")
        ?.getBoundingClientRect();
      if (!viewBox) {
        cancel();
        return;
      }
      const size = scroll.getLayout().totalContentSize;
      const shownScale = shown?.a ?? 1;
      const oldLeft =
        (shown?.e ?? 0) +
        viewBox.left +
        PAGE_GAP +
        Math.max(
          0,
          (event.viewport.clientWidth -
            2 * PAGE_GAP -
            size.width * event.oldZoom) /
            2,
        ) -
        event.viewport.scrollLeft;
      const oldTop =
        (shown?.f ?? 0) +
        viewBox.top +
        PAGE_GAP +
        Math.max(
          0,
          (event.viewport.clientHeight -
            2 * PAGE_GAP -
            size.height * event.oldZoom) /
            2,
        ) -
        event.viewport.scrollTop;
      const scroller = element.querySelector<HTMLElement>(
        "[data-pdf-scroller]",
      );
      if (!scroller) {
        cancel();
        return;
      }
      // Start the animation in the frame that has the new layout, before it is
      // painted: a ResizeObserver runs after layout and before paint, where a
      // requestAnimationFrame would let one frame show the final scale first.
      let started = false;
      const start = (): void => {
        if (started) return;
        started = true;
        armed = undefined;
        cancel();
        const content = scroller.getBoundingClientRect();
        scroller.style.transformOrigin = "0 0";
        // Selection uses native final coordinates; settle the display before starting a new drag.
        animatedElement = scroller;
        scroller.style.pointerEvents = "none";
        const transition = scroller.animate(
          [
            {
              transform: `translate(${oldLeft - content.left}px, ${oldTop - content.top}px) scale(${(event.oldZoom * shownScale) / event.newZoom})`,
            },
            { transform: "scale(1)" },
          ],
          { duration: MOTION_MS, easing: "ease-out" },
        );
        animation = transition;
        transition.onfinish = () => {
          if (animation !== transition) return;
          scroller.style.pointerEvents = "";
          animatedElement = undefined;
        };
      };
      // The layout may already have changed (sync) or change before paint (the
      // resize observer below), or not change in size at all: start by then.
      armed = start;
      frame = requestAnimationFrame(() => requestAnimationFrame(start));
    });
    // The scroller's layout size, as of its last change: a change after a zoom
    // is the new layout, seen after layout and before the frame is painted.
    const sizes = new ResizeObserver(() => {
      const scroller = element.querySelector<HTMLElement>(
        "[data-pdf-scroller]",
      );
      const now = scroller ? `${scroller.offsetWidth}x${scroller.offsetHeight}` : "";
      const changed = now !== known;
      known = now;
      if (changed) armed?.();
    });
    // The scroller appears once the document has a layout: watch it from then.
    let watching = 0;
    const watch = (): void => {
      const scroller = element.querySelector<HTMLElement>(
        "[data-pdf-scroller]",
      );
      if (scroller) sizes.observe(scroller);
      else watching = requestAnimationFrame(watch);
    };
    watch();
    // The zoom plugin asks for a scroll just before it reports its zoom change,
    // which carries on from the animation on screen: let it, or one frame would
    // show the old layout without the animation. Other scrolls end it.
    let zoomed = false;
    const stopOnScroll = viewport?.onScrollRequest(DOCUMENT_ID, () => {
      zoomed = false;
      queueMicrotask(() => {
        if (!zoomed) cancel();
      });
    });
    // Zooming with the wheel keeps its own animation; other input ends it.
    const cancelUnlessZoom = (event: Event): void => {
      if (
        event instanceof WheelEvent &&
        (event.ctrlKey || event.metaKey)
      )
        return;
      cancel();
    };
    for (const type of ["pointerdown", "touchstart", "keydown", "wheel"])
      element.addEventListener(type, cancelUnlessZoom, { capture: true });
    return () => {
      cancel();
      unsubscribe();
      cancelAnimationFrame(watching);
      sizes.disconnect();
      stopOnScroll?.();
      for (const type of ["pointerdown", "touchstart", "keydown", "wheel"])
        element.removeEventListener(type, cancelUnlessZoom, { capture: true });
    };
  }, [container, smooth, zoom, viewport, scroll]);
}
