import { useViewportPlugin } from "@embedpdf/plugin-viewport/react";
import { useEffect, useState, type RefObject } from "react";
import {
  WheelGesture,
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
    if (!element || !viewport) {
      return;
    }
    const wheel = new SmoothWheel(viewport, { smooth, direction, bounds });
    // Native page/zoom requests supersede a wheel animation.
    const unsubscribe = plugin?.onScrollRequest(DOCUMENT_ID, wheel.cancel);
    element.addEventListener("wheel", wheel.onWheel, {
      passive: false,
      capture: true,
    });
    for (const type of INTERRUPTING_INPUT) {
      element.addEventListener(type, wheel.interrupt, { capture: true });
    }
    return () => {
      wheel.interrupt();
      unsubscribe?.();
      element.removeEventListener("wheel", wheel.onWheel, { capture: true });
      for (const type of INTERRUPTING_INPUT) {
        element.removeEventListener(type, wheel.interrupt, { capture: true });
      }
    };
  }, [container, smooth, direction, bounds, plugin]);
}

/** Input that stops a wheel animation where it is. */
const INTERRUPTING_INPUT = ["pointerdown", "touchstart", "keydown"];

/** A mouse wheel's notches over one viewport, animated or stepped. */
class SmoothWheel {
  private readonly gesture = new WheelGesture();
  private frame = 0;
  private target = 0;
  private axis: "scrollTop" | "scrollLeft" = "scrollTop";

  constructor(
    private readonly viewport: HTMLElement,
    private readonly options: {
      smooth: boolean;
      direction: ScrollDirection;
      bounds: ScrollBounds;
    },
  ) {}

  readonly cancel = (): void => {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  };

  /** Stop where the viewport is now. */
  readonly interrupt = (): void => {
    this.cancel();
    const { viewport } = this;
    viewport.scrollTo({
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
      behavior: "instant",
    });
  };

  readonly onWheel = (event: WheelEvent): void => {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest(".viewport")
    ) {
      return;
    }
    const { smooth, direction } = this.options;
    const horizontal = event.shiftKey || direction === "horizontal";
    const discrete =
      this.gesture.discrete(event, event.timeStamp) &&
      !event.ctrlKey &&
      !event.metaKey;
    if (!discrete || (!smooth && !horizontal)) {
      this.interrupt();
      return;
    }
    event.preventDefault();
    this.step(event, horizontal);
  };

  /** Move one notch further along the axis, adding to a move in progress. */
  private step(event: WheelEvent, horizontal: boolean): void {
    const { viewport } = this;
    const nextAxis = horizontal ? "scrollLeft" : "scrollTop";
    if (nextAxis !== this.axis) {
      this.cancel();
    }
    this.axis = nextAxis;
    const from = viewport[this.axis];
    const previous = this.frame ? this.target : from;
    this.interrupt();
    const limits = this.options.bounds(viewport);
    this.target = wheelTarget(
      from,
      previous,
      wheelPixels(
        event.deltaY,
        event.deltaMode,
        horizontal ? viewport.clientWidth : viewport.clientHeight,
      ),
      horizontal ? limits.x : limits.y,
    );
    if (this.options.smooth) {
      this.animate(from, this.axis);
    } else {
      viewport[this.axis] = this.target;
    }
  }

  private animate(from: number, axis: "scrollTop" | "scrollLeft"): void {
    const start = performance.now();
    const tick = (now: number): void => {
      const progress = motionProgress(now - start);
      this.viewport[axis] = from + (this.target - from) * progress;
      this.frame = progress < 1 ? requestAnimationFrame(tick) : 0;
    };
    this.frame = requestAnimationFrame(tick);
  }
}
