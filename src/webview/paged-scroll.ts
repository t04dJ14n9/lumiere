import { useScrollState } from "./scroll-state";
import { ScrollStrategy } from "@embedpdf/plugin-scroll/react";
import { useZoom } from "@embedpdf/plugin-zoom/react";
import { useCallback, useLayoutEffect, type RefObject } from "react";
import { pageAxisBounds } from "../shared/page-window";
import type { ScrollMode } from "../shared/view-settings";
import { DOCUMENT_ID, PAGE_GAP } from "./plugins";

export type ScrollBounds = (viewport: HTMLElement) => {
  x: { min: number; max: number };
  y: { min: number; max: number };
};

/** Keep native rendering and coordinates, but limit panning to the selected page/spread. */
export function usePagedScroll(
  container: RefObject<HTMLElement | null>,
  page: number,
  mode: ScrollMode,
): ScrollBounds {
  const { state } = useScrollState();
  const { state: zoom } = useZoom(DOCUMENT_ID);
  const item =
    mode === "paged"
      ? state.virtualItems.find((item) => item.pageNumbers.includes(page))
      : undefined;
  const { width, height } = state.totalContentSize;
  const scale = zoom.currentZoomLevel;
  const horizontal = state.strategy === ScrollStrategy.Horizontal;
  const bounds = useCallback<ScrollBounds>(
    (viewport) => {
      if (mode !== "paged" || !item)
        return {
          x: {
            min: 0,
            max: Math.max(0, viewport.scrollWidth - viewport.clientWidth),
          },
          y: {
            min: 0,
            max: Math.max(0, viewport.scrollHeight - viewport.clientHeight),
          },
        };
      const x = (item.x + (horizontal ? 0 : (width - item.width) / 2)) * scale;
      const y =
        (item.y + (horizontal ? (height - item.height) / 2 : 0)) * scale;
      return {
        x: pageAxisBounds(
          x,
          item.width * scale + 2 * PAGE_GAP,
          viewport.clientWidth,
          viewport.scrollWidth,
        ),
        y: pageAxisBounds(
          y,
          item.height * scale + 2 * PAGE_GAP,
          viewport.clientHeight,
          viewport.scrollHeight,
        ),
      };
    },
    [mode, item, width, height, scale, horizontal],
  );

  useLayoutEffect(() => {
    const viewport = container.current?.querySelector<HTMLElement>(".viewport");
    if (mode !== "paged" || !viewport || !item) return;
    const constrain = (): void => {
      // A zoom step lays the pages out first and reports its scale to React a
      // moment later: limits worked out for the old scale would pull the scroll
      // that keeps the zoom's centre back. This runs again with the new scale.
      const shown = Number(
        viewport.querySelector<HTMLElement>(".page")?.dataset.scale,
      );
      if (shown > 0 && Math.abs(shown / scale - 1) > 0.001) return;
      const { x, y } = bounds(viewport);
      const left = Math.min(x.max, Math.max(x.min, viewport.scrollLeft));
      const top = Math.min(y.max, Math.max(y.min, viewport.scrollTop));
      if (left !== viewport.scrollLeft || top !== viewport.scrollTop)
        viewport.scrollTo({ left, top, behavior: "instant" });
    };
    constrain();
    viewport.addEventListener("scroll", constrain, { capture: true });
    return () =>
      viewport.removeEventListener("scroll", constrain, { capture: true });
  }, [container, mode, item, bounds, scale]);
  return bounds;
}
