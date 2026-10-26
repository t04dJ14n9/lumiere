/**
 * One pointer sample as the canvas records it: Pointer Events' fields,
 * already placed in the sketch's coordinates, without the DOM, so that
 * recording runs and is tested anywhere.
 */

export interface InputSample {
  readonly x: number;
  readonly y: number;
  /** Milliseconds on a clock that only moves forwards (`event.timeStamp`). */
  readonly time: number;
  /** Pointer Events' pressure, 0 to 1; a mouse button held down reads 0.5. */
  readonly pressure: number;
  /** Degrees, -90 to 90: how far the pen leans towards +x and +y. */
  readonly tiltX?: number;
  readonly tiltY?: number;
  /** Radians, where the browser gives them (Pointer Events level 3). */
  readonly altitudeAngle?: number;
  readonly azimuthAngle?: number;
}

/** The tip's angles, as the file stores them (types.ts, `InkPoint`). */
export interface PenAngles {
  /** 0 lying flat, π/2 upright. */
  readonly altitude: number;
  /** 0 leaning towards +x, growing towards +y, in [0, 2π). */
  readonly azimuth: number;
}

/** How a mouse, a trackpad or a finger is taken to be held. */
export const UPRIGHT: PenAngles = { altitude: Math.PI / 2, azimuth: 0 };

/** The pen's angles: the browser's own where it gives them, else from its tilt. */
export function penAngles(sample: InputSample): PenAngles {
  if (sample.altitudeAngle !== undefined && sample.azimuthAngle !== undefined) {
    return {
      altitude: clamp(sample.altitudeAngle, 0, Math.PI / 2),
      azimuth: positiveAngle(sample.azimuthAngle),
    };
  }
  return anglesFromTilt(sample.tiltX ?? 0, sample.tiltY ?? 0);
}

/**
 * Altitude and azimuth from tiltX and tiltY: the pen's axis points along
 * (tan tiltX, tan tiltY, 1), so it leans in that direction, as far from
 * upright as the two tangents together say.
 */
export function anglesFromTilt(tiltX: number, tiltY: number): PenAngles {
  const leanX = Math.tan(radians(clamp(tiltX, -90, 90)));
  const leanY = Math.tan(radians(clamp(tiltY, -90, 90)));
  const lean = Math.hypot(leanX, leanY);
  if (lean < 1e-9) {
    return UPRIGHT;
  }
  return {
    altitude: Math.atan(1 / lean),
    azimuth: positiveAngle(Math.atan2(leanY, leanX)),
  };
}

function positiveAngle(angle: number): number {
  const turn = 2 * Math.PI;
  return ((angle % turn) + turn) % turn;
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
