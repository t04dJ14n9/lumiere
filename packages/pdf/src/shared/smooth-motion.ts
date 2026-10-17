export const MOTION_MS = 140;

/** A bounded ease-out curve; using absolute elapsed time avoids frame-rate drift. */
export function motionProgress(elapsed: number, duration = MOTION_MS): number {
  const t = Math.min(1, Math.max(0, elapsed / duration));
  return 1 - (1 - t) ** 3;
}

export interface WheelDelta {
  deltaX: number;
  deltaY: number;
  /** DOM delta modes: pixel = 0, line = 1, page = 2. */
  deltaMode: number;
}

/** Only identifiable discrete notches; small/fractional/diagonal pixel deltas stay native. */
export function isDiscreteWheel({
  deltaX,
  deltaY,
  deltaMode,
}: WheelDelta): boolean {
  if (!Number.isFinite(deltaY) || deltaY === 0 || deltaX !== 0) {
    return false;
  }
  if (deltaMode === 1 || deltaMode === 2) {
    return true;
  }
  const amount = Math.abs(deltaY);
  return (
    deltaMode === 0 &&
    Number.isInteger(amount) &&
    amount >= 100 &&
    (amount % 100 === 0 || amount % 120 === 0)
  );
}

export function wheelPixels(
  delta: number,
  mode: number,
  pageSize: number,
): number {
  return delta * (mode === 1 ? 40 : mode === 2 ? pageSize : 1);
}

/** Adds wheel steps, but reversals start at the displayed position immediately. */
export function wheelTarget(
  position: number,
  target: number,
  delta: number,
  min: number,
  max: number,
): number {
  const remaining = target - position;
  const from =
    remaining !== 0 && Math.sign(remaining) !== Math.sign(delta)
      ? position
      : target;
  return Math.min(max, Math.max(min, from + delta));
}

/** A pause this long (ms) between wheel events ends a gesture. */
export const WHEEL_GESTURE_GAP = 150;

/**
 * Tells mouse-wheel notches from trackpad gestures. A trackpad flick can
 * include a delta that looks like a notch (an integral 100 or 200), so the
 * whole gesture is judged: once any event of it is not a notch (small,
 * fractional, diagonal), the rest of it, momentum included, is native.
 */
export class WheelGesture {
  private last = -Infinity;
  private trackpad = false;

  /** Whether this event is a discrete notch, to be animated rather than left to native scrolling. */
  discrete(event: WheelDelta, time: number): boolean {
    if (time - this.last > WHEEL_GESTURE_GAP) {
      this.trackpad = false;
    }
    this.last = time;
    if (!isDiscreteWheel(event)) {
      this.trackpad = true;
    }
    return !this.trackpad;
  }
}

/** Overscroll, in pixels, that turns a page in paged mode. */
export const EDGE_TURN_PIXELS = 60;

/**
 * Turns pages in paged mode from wheel and trackpad deltas that push against
 * the edge of the page. One gesture turns one page: momentum after a turn is
 * ignored until the deltas pause, reverse, or a new swipe starts (a delta
 * more than twice its predecessor).
 */
export class EdgeTurn {
  private pending = 0;
  private last = -Infinity;
  private previous = 0;
  private locked = false;

  /** `delta` along the paging axis; `atEdge` whether the view is already at the edge it pushes toward. */
  push(delta: number, atEdge: boolean, time: number): -1 | 0 | 1 {
    if (delta === 0) {
      return 0;
    }
    const reversed = Math.sign(delta) !== Math.sign(this.previous);
    const size = Math.abs(delta);
    if (time - this.last > WHEEL_GESTURE_GAP || reversed) {
      this.locked = false;
      this.pending = 0;
    } else if (
      this.locked &&
      size > Math.abs(this.previous) * 2 &&
      size >= 20
    ) {
      this.locked = false;
    }
    this.last = time;
    this.previous = delta;
    if (!atEdge) {
      this.pending = 0;
      return 0;
    }
    if (this.locked) {
      return 0;
    }
    this.pending += delta;
    if (Math.abs(this.pending) < EDGE_TURN_PIXELS) {
      return 0;
    }
    this.pending = 0;
    this.locked = true;
    return delta > 0 ? 1 : -1;
  }
}
