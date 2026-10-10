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
  if (!Number.isFinite(deltaY) || deltaY === 0 || deltaX !== 0) return false;
  if (deltaMode === 1 || deltaMode === 2) return true;
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
