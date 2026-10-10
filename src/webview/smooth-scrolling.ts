import { useViewportPlugin } from "@embedpdf/plugin-viewport/react";
import { useEffect, useState, type RefObject } from "react";
import {
  isDiscreteWheel,
  motionProgress,
  wheelPixels,
  wheelTarget,
} from "../shared/smooth-motion";
import {
  resolveSmoothScrolling,
  type ScrollDirection,
} from "../shared/view-settings";
import type { ScrollBounds } from "./paged-scroll";
import { DOCUMENT_ID } from "./plugins";

export function useSmoothMotion(enabled: boolean | null): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = (): void => setReduced(query.matches);
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);
  return resolveSmoothScrolling(enabled, false, reduced);
}

/** Animate discrete wheels only. Native pixel scrolling interrupts any pending wheel animation. */
export function useSmoothWheel(
  container: RefObject<HTMLElement | null>,
  smooth: boolean,
  direction: ScrollDirection,
  bounds: ScrollBounds,
): void {
  const { plugin } = useViewportPlugin();
  useEffect(() => {
    const element = container.current;
    const viewport = element?.querySelector<HTMLElement>(".viewport");
    if (!element || !viewport) return;
    let frame = 0;
    let target = 0;
    let axis: "scrollTop" | "scrollLeft" = "scrollTop";
    const cancel = (): void => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const interrupt = (): void => {
      cancel();
      viewport.scrollTo({
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
        behavior: "instant",
      });
    };
    const wheel = (event: WheelEvent): void => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".viewport")
      )
        return;
      if (event.ctrlKey || event.metaKey || !isDiscreteWheel(event)) {
        interrupt();
        return;
      }
      const horizontal = event.shiftKey || direction === "horizontal";
      if (!smooth && !horizontal) {
        interrupt();
        return;
      }
      event.preventDefault();
      const nextAxis = horizontal ? "scrollLeft" : "scrollTop";
      if (nextAxis !== axis) cancel();
      axis = nextAxis;
      const from = viewport[axis];
      const previous = frame ? target : from;
      interrupt();
      const limit = horizontal ? bounds(viewport).x : bounds(viewport).y;
      target = wheelTarget(
        from,
        previous,
        wheelPixels(
          event.deltaY,
          event.deltaMode,
          horizontal ? viewport.clientWidth : viewport.clientHeight,
        ),
        limit.min,
        limit.max,
      );
      if (!smooth) {
        viewport[axis] = target;
        return;
      }
      const start = performance.now();
      const tick = (now: number): void => {
        const progress = motionProgress(now - start);
        viewport[axis] = from + (target - from) * progress;
        frame = progress < 1 ? requestAnimationFrame(tick) : 0;
      };
      frame = requestAnimationFrame(tick);
    };
    // Native page/zoom requests supersede a wheel animation.
    const unsubscribe = plugin?.onScrollRequest(DOCUMENT_ID, cancel);
    element.addEventListener("wheel", wheel, { passive: false, capture: true });
    for (const type of ["pointerdown", "touchstart", "keydown"])
      element.addEventListener(type, interrupt, { capture: true });
    return () => {
      interrupt();
      unsubscribe?.();
      element.removeEventListener("wheel", wheel, { capture: true });
      for (const type of ["pointerdown", "touchstart", "keydown"])
        element.removeEventListener(type, interrupt, { capture: true });
    };
  }, [container, smooth, direction, bounds, plugin]);
}
