import { useEffect, useRef, type RefObject } from "react";
import { keyMove } from "../shared/paging-keys";
import { EdgeTurn } from "../shared/smooth-motion";
import type { ScrollDirection, ScrollMode } from "../shared/view-settings";
import type { ScrollBounds } from "./paged-scroll";

/** Elements that keep the arrow keys for themselves (text, numbers, menus, the toolbar grip). */
const OWN_KEYS =
  'input, textarea, select, [contenteditable], [role="slider"], [role="spinbutton"], [role="listbox"], [role="menu"], [role="combobox"], .view-menu, .grip';

export interface PagingInput {
  mode: ScrollMode;
  direction: ScrollDirection;
  bounds: ScrollBounds;
  /** Turn to the next (1) or previous (-1) page or spread. */
  step: (delta: 1 | -1) => void;
}

/**
 * Arrow and Page keys, wherever focus is in the viewer (right after opening,
 * after a click on a page, or after a toolbar button or the View picker took
 * it): pan while there is room, else turn the page; see `keyMove`. Keys with a
 * modifier stay with VS Code and the extension's own shortcuts.
 */
export function usePagingKeys(
  container: RefObject<HTMLElement | null>,
  input: PagingInput,
): void {
  const latest = useRef(input);
  latest.current = input;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.target instanceof Element && event.target.closest(OWN_KEYS))
      )
        return;
      const viewport = container.current?.querySelector<HTMLElement>(".viewport");
      if (!viewport) return;
      const { mode, direction, bounds, step } = latest.current;
      const { x, y } = bounds(viewport);
      const move = keyMove(event.key, {
        mode,
        direction,
        width: viewport.clientWidth,
        height: viewport.clientHeight,
        room: {
          left: viewport.scrollLeft - x.min,
          right: x.max - viewport.scrollLeft,
          up: viewport.scrollTop - y.min,
          down: y.max - viewport.scrollTop,
        },
        overflowsX: viewport.scrollWidth > viewport.clientWidth + 1,
      });
      if (!move) return;
      event.preventDefault();
      if (move.type === "page") step(move.delta);
      else viewport.scrollBy({ left: move.x, top: move.y, behavior: "instant" });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [container]);
}

/**
 * In paged mode the viewport is held to the page, so a long wheel or
 * two-finger gesture would stop at its edge. Pushing against the edge turns
 * the page instead, once per gesture (see `EdgeTurn`).
 */
export function usePagedWheel(
  container: RefObject<HTMLElement | null>,
  input: PagingInput,
): void {
  const latest = useRef(input);
  latest.current = input;
  useEffect(() => {
    const element = container.current;
    if (!element || input.mode !== "paged") return;
    const turn = new EdgeTurn();
    const onWheel = (event: WheelEvent): void => {
      const viewport = element.querySelector<HTMLElement>(".viewport");
      if (
        !viewport ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !(event.target instanceof Element) ||
        !event.target.closest(".viewport")
      )
        return;
      const { direction, bounds, step } = latest.current;
      const horizontal =
        direction === "horizontal" &&
        Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const delta =
        direction === "horizontal" && !horizontal
          ? event.deltaY
          : horizontal
            ? event.deltaX
            : event.deltaY;
      // Page and line deltas count as screens and lines.
      const pixels =
        event.deltaMode === 1 ? delta * 40 : event.deltaMode === 2 ? delta * viewport.clientHeight : delta;
      const alongX = direction === "horizontal";
      const limit = alongX ? bounds(viewport).x : bounds(viewport).y;
      const at = alongX ? viewport.scrollLeft : viewport.scrollTop;
      const atEdge = pixels > 0 ? at >= limit.max - 1 : at <= limit.min + 1;
      const result = turn.push(pixels, atEdge, event.timeStamp);
      if (atEdge && pixels !== 0) event.preventDefault();
      if (result !== 0) step(result);
    };
    element.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => element.removeEventListener("wheel", onWheel, { capture: true });
  }, [container, input.mode]);
}
