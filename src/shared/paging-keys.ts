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
  | { type: "pan"; x: number; y: number }
  | { type: "page"; delta: 1 | -1 };

const ARROWS: Record<string, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
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
  const paged = view.mode === "paged";
  const arrow = ARROWS[key];
  if (arrow) {
    const room =
      arrow.x === 1
        ? view.room.right
        : arrow.x === -1
          ? view.room.left
          : arrow.y === 1
            ? view.room.down
            : view.room.up;
    if (room > 1)
      return {
        type: "pan",
        x: arrow.x * Math.min(ARROW_PIXELS, room),
        y: arrow.y * Math.min(ARROW_PIXELS, room),
      };
    const turns = arrow.x !== 0 ? paged || !view.overflowsX : paged;
    return turns ? { type: "page", delta: (arrow.x || arrow.y) as 1 | -1 } : undefined;
  }
  if (key !== "PageDown" && key !== "PageUp") return undefined;
  const sign = key === "PageDown" ? 1 : -1;
  const horizontal = view.direction === "horizontal";
  const room = horizontal
    ? sign === 1
      ? view.room.right
      : view.room.left
    : sign === 1
      ? view.room.down
      : view.room.up;
  if (room > 1) {
    const amount =
      Math.min(room, (horizontal ? view.width : view.height) * PAGE_KEY_FRACTION) *
      sign;
    return horizontal
      ? { type: "pan", x: amount, y: 0 }
      : { type: "pan", x: 0, y: amount };
  }
  return paged ? { type: "page", delta: sign } : undefined;
}
