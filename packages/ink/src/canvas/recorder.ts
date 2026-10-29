/**
 * One stroke as it is drawn: each pointer sample becomes a stored point with
 * the raw input (time, force, altitude, azimuth) and the width and opacity
 * the ink drew there, as the file keeps them (types.ts, `InkPoint`).
 *
 * A pen gives its own pressure and tilt. Other input reads none, so speed
 * stands in for pressure (speed.ts); its force is still stored as the
 * browser read it (a mouse's 0.5), so the file says what the hand did and
 * the width says what was drawn.
 */
import type { InkPoint, InkStroke } from "../format";
import { clamp, penAngles, UPRIGHT, type InputSample } from "./input";
import { inkAt, type Nib } from "./nibs";
import { SpeedPressure } from "./speed";

/**
 * Samples closer than this to the last point kept (in the sketch's points)
 * replace it rather than add to it: a high-rate mouse or pen would
 * otherwise store a point every fraction of a point, and a page of
 * handwriting would weigh many megabytes.
 */
export const MIN_STEP = 0.75;

export interface RecorderOptions {
  readonly nib: Nib;
  /** `#rrggbb`. */
  readonly color: string;
  /** Whether the input reads pressure and tilt (a pen); else speed stands in. */
  readonly sensesPressure: boolean;
}

export class StrokeRecorder {
  private readonly points: InkPoint[] = [];
  private readonly speed = new SpeedPressure();
  private start: number | undefined;

  constructor(private readonly options: RecorderOptions) {}

  add(sample: InputSample): void {
    const point = this.pointAt(sample);
    const last = this.points.at(-1);
    const beforeLast = this.points.at(-2);
    // The last point stands in for the samples since the one before it
    // until the pointer has moved a step on; the first is where it landed.
    if (last && beforeLast && distance(beforeLast, last) < MIN_STEP) {
      this.points[this.points.length - 1] = point;
    } else {
      this.points.push(point);
    }
  }

  get isEmpty(): boolean {
    return this.points.length === 0;
  }

  stroke(): InkStroke {
    return {
      tool: this.options.nib.tool,
      color: this.options.color,
      points: [...this.points],
    };
  }

  private pointAt(sample: InputSample): InkPoint {
    this.start ??= sample.time;
    const { sensesPressure, nib } = this.options;
    // Kept up on every sample, so its speed is right if read later.
    const fromSpeed = this.speed.next(sample);
    const angles = sensesPressure ? penAngles(sample) : UPRIGHT;
    const force = clamp(sample.pressure, 0, 1);
    const drawn = inkAt(nib, {
      pressure: sensesPressure ? force : fromSpeed,
      altitude: angles.altitude,
    });
    return {
      x: sample.x,
      y: sample.y,
      t: Math.max(0, sample.time - this.start) / 1000,
      force,
      altitude: angles.altitude,
      azimuth: angles.azimuth,
      width: drawn.width,
      opacity: drawn.opacity,
    };
  }
}

function distance(a: InkPoint, b: InkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
