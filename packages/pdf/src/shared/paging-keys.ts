import type { ScrollDirection, ScrollMode } from "./view-settings";

/** Pixels an arrow key pans; a Page key pans this fraction of the viewport. */
export const ARROW_PIXELS = 40;
export const PAGE_KEY_FRACTION = 0.875;

/** What the viewer can do from where it stands, in pixels left to scroll each way. */
export interface KeyContext {
  mode: ScrollMode;
  direction: ScrollDirection;
  width: number;
  height: number;
  room: { left: number; right: number; up: number; down: number };
  /** Whether the content is wider than the viewport at all. */
  overflowsX: boolean;
}

export type KeyMove =
  { type: "pan"; x: number; y: number } | { type: "page"; delta: 1 | -1 };

type Side = keyof KeyContext["room"];

interface Arrow {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
  /** The side it pans towards. */
  side: Side;
}

const ARROWS: Record<string, Arrow> = {
  ArrowLeft: { x: -1, y: 0, side: "left" },
  ArrowRight: { x: 1, y: 0, side: "right" },
  ArrowUp: { x: 0, y: -1, side: "up" },
  ArrowDown: { x: 0, y: 1, side: "down" },
};

/** The side PageDown (1) and PageUp (-1) pan towards, by reading direction. */
const PAGE_KEY_SIDES: Record<ScrollDirection, Record<1 | -1, Side>> = {
  horizontal: { 1: "right", [-1]: "left" },
  vertical: { 1: "down", [-1]: "up" },
};

/**
 * What an unmodified navigation key does, as in Chrome, Acrobat and Preview:
 *
 * - An arrow pans that way while there is room.
 * - Out of room, Left/Right turn the page when the page fits across the viewer
 *   (or pages are shown one at a time), and Up/Down turn it only in paged mode.
 *   A zoomed page in continuous mode just stops at its edge.
 * - PageDown/PageUp pan a screen along the reading direction while there is
 *   room, then turn the page in paged mode.
 */
export function keyMove(key: string, view: KeyContext): KeyMove | undefined {
  const arrow = ARROWS[key];
  if (arrow) {
    return arrowMove(arrow, view);
  }
  if (key === "PageDown" || key === "PageUp") {
    return pageKeyMove(key === "PageDown" ? 1 : -1, view);
  }
  return undefined;
}

function arrowMove(arrow: Arrow, view: KeyContext): KeyMove | undefined {
  const room = view.room[arrow.side];
  if (room > 1) {
    return {
      type: "pan",
      x: arrow.x * Math.min(ARROW_PIXELS, room),
      y: arrow.y * Math.min(ARROW_PIXELS, room),
    };
  }
  const paged = view.mode === "paged";
  const turns = arrow.x !== 0 ? paged || !view.overflowsX : paged;
  return turns
    ? { type: "page", delta: (arrow.x || arrow.y) as 1 | -1 }
    : undefined;
}

function pageKeyMove(sign: 1 | -1, view: KeyContext): KeyMove | undefined {
  const horizontal = view.direction === "horizontal";
  const room = view.room[PAGE_KEY_SIDES[view.direction][sign]];
  if (room > 1) {
    const viewport = horizontal ? view.width : view.height;
    const amount = Math.min(room, viewport * PAGE_KEY_FRACTION) * sign;
    return horizontal
      ? { type: "pan", x: amount, y: 0 }
      : { type: "pan", x: 0, y: amount };
  }
  return view.mode === "paged" ? { type: "page", delta: sign } : undefined;
}
