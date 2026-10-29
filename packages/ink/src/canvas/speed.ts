/**
 * Pressure for input that reads none (a mouse, a trackpad, a finger): the
 * faster the pointer moves, the lighter it is taken to press, as a pen
 * dragged quickly leaves a thinner line. perfect-freehand's simulated
 * pressure is the model; this one follows speed over time rather than
 * distance between samples, since browsers sample at 60 to 1000 Hz.
 */

/** The pressure of a pointer at rest: a little over half, so a slow line is full. */
export const RESTING_PRESSURE = 0.6;
/** The pressure the fastest strokes thin towards. */
export const FASTEST_PRESSURE = 0.1;
/** The speed, in the sketch's points per second, that thins a line halfway. */
export const HALF_SPEED = 700;
/** How long a change of speed takes to show, in milliseconds. */
const EASING_MS = 40;

/** The pressure a pointer moving at `speed` (points per second) is taken to press with. */
export function pressureForSpeed(speed: number): number {
  const fast = Math.max(0, speed) / (Math.max(0, speed) + HALF_SPEED);
  return RESTING_PRESSURE - (RESTING_PRESSURE - FASTEST_PRESSURE) * fast;
}

interface Position {
  readonly x: number;
  readonly y: number;
  /** Milliseconds. */
  readonly time: number;
}

/** One stroke's speed, eased over its samples, as a pressure. */
export class SpeedPressure {
  private last: Position | undefined;
  private speed = 0;

  /** The pressure at this sample. The first sample of a stroke is at rest. */
  next(sample: Position): number {
    const last = this.last;
    if (!last) {
      this.last = sample;
      return pressureForSpeed(0);
    }
    const elapsed = sample.time - last.time;
    // Samples with one time stamp (coalesced events can share one) carry
    // no speed; the distance they cover counts once time has passed.
    if (elapsed > 0) {
      const moved = Math.hypot(sample.x - last.x, sample.y - last.y);
      const current = (moved / elapsed) * 1000;
      const weight = 1 - Math.exp(-elapsed / EASING_MS);
      this.speed += (current - this.speed) * weight;
      this.last = sample;
    }
    return pressureForSpeed(this.speed);
  }
}
