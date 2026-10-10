import { useZoomCapability } from "@embedpdf/plugin-zoom/react";
import { useViewportPlugin } from "@embedpdf/plugin-viewport/react";
import { useEffect, useMemo, type RefObject } from "react";
import { MOTION_MS } from "../shared/smooth-motion";
import { DOCUMENT_ID, PAGE_GAP } from "./plugins";
import { useScrollState } from "./scroll-state";

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
    const cancel = (): void => {
      cancelAnimationFrame(frame);
      animation?.cancel();
      animation = undefined;
      if (animatedElement) animatedElement.style.pointerEvents = "";
      animatedElement = undefined;
    };
    const unsubscribe = zoom.onZoomChange((event) => {
      cancel();
      if (event.oldZoom === event.newZoom) return;
      const viewBox = element
        .querySelector<HTMLElement>(".viewport")
        ?.getBoundingClientRect();
      if (!viewBox) return;
      const size = scroll.getLayout().totalContentSize;
      const oldLeft =
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
      frame = requestAnimationFrame(() => {
        const scroller = element.querySelector<HTMLElement>(
          "[data-pdf-scroller]",
        );
        if (!scroller) return;
        const content = scroller.getBoundingClientRect();
        scroller.style.transformOrigin = "0 0";
        // Selection uses native final coordinates; settle the display before starting a new drag.
        animatedElement = scroller;
        scroller.style.pointerEvents = "none";
        const transition = scroller.animate(
          [
            {
              transform: `translate(${oldLeft - content.left}px, ${oldTop - content.top}px) scale(${event.oldZoom / event.newZoom})`,
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
      });
    });
    const stopOnScroll = viewport?.onScrollRequest(DOCUMENT_ID, cancel);
    for (const type of ["pointerdown", "touchstart", "keydown", "wheel"])
      element.addEventListener(type, cancel, { capture: true });
    return () => {
      cancel();
      unsubscribe();
      stopOnScroll?.();
      for (const type of ["pointerdown", "touchstart", "keydown", "wheel"])
        element.removeEventListener(type, cancel, { capture: true });
    };
  }, [container, smooth, zoom, viewport, scroll]);
}
