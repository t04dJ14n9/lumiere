/**
 * The pointer on the canvas: a pen, a mouse or a finger draws, or erases
 * with the eraser (or a pen's eraser end). As on the iPad, once a pen has
 * drawn a finger pans instead, two fingers pan and pinch to zoom, and a
 * finger already drawing when a pen comes down was a palm, so its stroke
 * is dropped. A mouse pans with its middle button, or with Space held.
 *
 * Each move reads the samples the browser coalesced into it, so a fast pen
 * keeps every point it reported, not one per frame.
 */
import type { InkStroke } from "../format";
import type { ViewPoint } from "./camera";
import { strokesTouched, type Point } from "./erase";
import type { InputSample } from "./input";
import { chosenInk, ERASER_RADIUS, type ToolChoice } from "./nibs";
import type { EraserRing } from "./painter";
import { StrokeRecorder } from "./recorder";

/** Pointer Events' buttons: the middle one, and a pen's eraser end. */
const MIDDLE_BUTTON = 1;
const ERASER_BUTTON = 5;

export interface PointerHost {
  /** What takes the pointer: the whole view. */
  readonly surface: HTMLElement;
  /** The sketch's point under a point of the window. */
  toSketch(client: ViewPoint): Point;
  /** The paper moved by (dx, dy) CSS pixels, under a dragging hand. */
  drag(dx: number, dy: number): void;
  /** Two fingers moved from `before` to `after`, in the window's coordinates. */
  pinch(
    before: readonly [ViewPoint, ViewPoint],
    after: readonly [ViewPoint, ViewPoint],
  ): void;
  /** Whether the mouse pans rather than draws (Space is held). */
  isPanning(): boolean;
  /** What the palette has chosen, now. */
  choice(): ToolChoice;
  /** The strokes shown now, for the eraser. */
  strokes(): readonly InkStroke[];
  /** The stroke being drawn changed; undefined once it ends or is dropped. */
  drawing(stroke: InkStroke | undefined): void;
  drawn(stroke: InkStroke): void;
  /** The eraser touched these strokes; `erasingDone` once it lifts. */
  erased(strokes: ReadonlySet<InkStroke>): void;
  erasingDone(): void;
  /** Where the eraser's ring shows, if anywhere. */
  eraserAt(ring: EraserRing | undefined): void;
}

type Gesture =
  | {
      readonly kind: "draw";
      readonly pointerId: number;
      readonly pointerType: string;
      readonly recorder: StrokeRecorder;
    }
  | { readonly kind: "erase"; readonly pointerId: number; last: Point }
  | { readonly kind: "pan"; readonly pointerId: number; last: ViewPoint }
  | { readonly kind: "pinch"; readonly pointerIds: readonly [number, number] };

export class PointerInput {
  private gesture: Gesture | undefined;
  private hasPenDrawn = false;
  /** Where each finger on the canvas is, in the window's coordinates. */
  private readonly fingers = new Map<number, ViewPoint>();
  private readonly listening = new AbortController();

  constructor(private readonly host: PointerHost) {
    const { surface } = host;
    const options = { signal: this.listening.signal };
    surface.addEventListener(
      "pointerdown",
      (event) => this.down(event),
      options,
    );
    surface.addEventListener(
      "pointermove",
      (event) => this.move(event),
      options,
    );
    surface.addEventListener("pointerup", (event) => this.up(event), options);
    surface.addEventListener(
      "pointercancel",
      (event) => this.cancel(event),
      options,
    );
    surface.addEventListener(
      "pointerleave",
      () => {
        if (!this.gesture) {
          host.eraserAt(undefined);
        }
      },
      options,
    );
  }

  dispose(): void {
    this.listening.abort();
  }

  private down(event: PointerEvent): void {
    if (event.pointerType === "touch") {
      this.fingers.set(event.pointerId, clientOf(event));
      if (this.fingers.size === 2) {
        this.startPinch(event);
        return;
      }
    }
    const start = startOf(event, this.host.isPanning());
    if (!start || !this.letGoOfPalm(event)) {
      return;
    }
    event.preventDefault();
    this.host.surface.focus({ preventScroll: true });
    capture(this.host.surface, event.pointerId);
    const { pointerId, pointerType } = event;
    if (start === "pan" || (pointerType === "touch" && this.hasPenDrawn)) {
      this.gesture = { kind: "pan", pointerId, last: clientOf(event) };
      return;
    }
    this.hasPenDrawn ||= pointerType === "pen";
    const ink = chosenInk(this.host.choice());
    if (!ink || start === "erase") {
      const [at = { x: 0, y: 0 }] = this.samples(event, false);
      this.gesture = { kind: "erase", pointerId, last: at };
      this.eraseTo(at);
      return;
    }
    const recorder = new StrokeRecorder({
      ...ink,
      sensesPressure: pointerType === "pen",
    });
    this.gesture = { kind: "draw", pointerId, pointerType, recorder };
    this.record(recorder, event);
  }

  /**
   * A second finger: whatever the first was doing, the two now pan and
   * zoom. Not while a pen or a mouse is busy: fingers then are a palm.
   */
  private startPinch(event: PointerEvent): void {
    const [first, second] = [...this.fingers.keys()];
    const current = this.gesture;
    const isFingers =
      !current ||
      (current.kind !== "pinch" && this.fingers.has(current.pointerId));
    if (first === undefined || second === undefined || !isFingers) {
      return;
    }
    if (current?.kind === "draw") {
      this.host.drawing(undefined);
    } else if (current?.kind === "erase") {
      this.host.erasingDone();
    }
    event.preventDefault();
    capture(this.host.surface, event.pointerId);
    this.gesture = { kind: "pinch", pointerIds: [first, second] };
  }

  /**
   * Whether a new pointer may start: none is down, or a finger is drawing
   * and this is a pen, in which case the finger was a palm resting.
   */
  private letGoOfPalm(event: PointerEvent): boolean {
    const current = this.gesture;
    if (!current) {
      return true;
    }
    if (
      event.pointerType === "pen" &&
      current.kind === "draw" &&
      current.pointerType === "touch"
    ) {
      this.gesture = undefined;
      this.host.drawing(undefined);
      return true;
    }
    return false;
  }

  private move(event: PointerEvent): void {
    const before = this.fingersOf(this.gesture);
    if (event.pointerType === "touch" && this.fingers.has(event.pointerId)) {
      this.fingers.set(event.pointerId, clientOf(event));
    }
    const gesture = this.gesture;
    if (!gesture) {
      this.hover(event);
    } else if (gesture.kind === "pinch") {
      const after = this.fingersOf(gesture);
      if (before && after) {
        this.host.pinch(before, after);
      }
    } else if (event.pointerId === gesture.pointerId) {
      this.continueGesture(gesture, event);
    }
  }

  private continueGesture(
    gesture: Exclude<Gesture, { kind: "pinch" }>,
    event: PointerEvent,
  ): void {
    switch (gesture.kind) {
      case "draw":
        this.record(gesture.recorder, event);
        return;
      case "erase":
        for (const sample of this.samples(event, true)) {
          this.eraseTo(sample);
        }
        return;
      case "pan": {
        const at = clientOf(event);
        this.host.drag(at.x - gesture.last.x, at.y - gesture.last.y);
        gesture.last = at;
      }
    }
  }

  private up(event: PointerEvent): void {
    this.fingers.delete(event.pointerId);
    const gesture = this.endGesture(event);
    if (gesture?.kind === "draw") {
      // Not the up event's own sample: it reads no pressure, and would taper the end.
      this.host.drawing(undefined);
      this.host.drawn(gesture.recorder.stroke());
    } else if (gesture?.kind === "erase") {
      this.host.erasingDone();
      this.hover(event);
    }
  }

  /** The browser took the pointer (a gesture, a dialog): a stroke is dropped. */
  private cancel(event: PointerEvent): void {
    this.fingers.delete(event.pointerId);
    const gesture = this.endGesture(event);
    if (gesture?.kind === "draw") {
      this.host.drawing(undefined);
    } else if (gesture?.kind === "erase") {
      this.host.erasingDone();
    }
  }

  /** The gesture this pointer was part of, now ended. */
  private endGesture(event: PointerEvent): Gesture | undefined {
    const gesture = this.gesture;
    const isPart =
      gesture?.kind === "pinch"
        ? gesture.pointerIds.includes(event.pointerId)
        : gesture?.pointerId === event.pointerId;
    if (!gesture || !isPart) {
      return undefined;
    }
    this.gesture = undefined;
    return gesture;
  }

  private fingersOf(
    gesture: Gesture | undefined,
  ): readonly [ViewPoint, ViewPoint] | undefined {
    if (gesture?.kind !== "pinch") {
      return undefined;
    }
    const [first, second] = gesture.pointerIds.map((id) =>
      this.fingers.get(id),
    );
    return first && second ? [first, second] : undefined;
  }

  private hover(event: PointerEvent): void {
    const isErasing =
      this.host.choice().tool === "eraser" && event.pointerType !== "touch";
    const [at] = isErasing ? this.samples(event, false) : [];
    this.host.eraserAt(at && { ...at, radius: ERASER_RADIUS });
  }

  private record(recorder: StrokeRecorder, event: PointerEvent): void {
    for (const sample of this.samples(event, true)) {
      recorder.add(sample);
    }
    this.host.drawing(recorder.stroke());
  }

  private eraseTo(at: Point): void {
    const gesture = this.gesture;
    if (gesture?.kind !== "erase") {
      return;
    }
    const touched = strokesTouched(
      this.host.strokes(),
      { from: gesture.last, to: at },
      ERASER_RADIUS,
    );
    gesture.last = at;
    if (touched.size > 0) {
      this.host.erased(touched);
    }
    this.host.eraserAt({ ...at, radius: ERASER_RADIUS });
  }

  /** The event's samples in the sketch's points: the coalesced ones too, when asked. */
  private samples(event: PointerEvent, isCoalesced: boolean): InputSample[] {
    const coalesced =
      isCoalesced && typeof event.getCoalescedEvents === "function"
        ? event.getCoalescedEvents()
        : [];
    return (coalesced.length > 0 ? coalesced : [event]).map((each) =>
      sampleOf(each, this.host.toSketch(clientOf(each))),
    );
  }
}

/** What a pointer coming down starts, if anything. */
function startOf(
  event: PointerEvent,
  isPanning: boolean,
): "draw" | "erase" | "pan" | undefined {
  if (event.pointerType === "pen" && event.button === ERASER_BUTTON) {
    return "erase";
  }
  if (event.pointerType === "mouse" && event.button === MIDDLE_BUTTON) {
    return "pan";
  }
  if (event.button !== 0) {
    return undefined;
  }
  return isPanning && event.pointerType === "mouse" ? "pan" : "draw";
}

function clientOf(event: PointerEvent): ViewPoint {
  return { x: event.clientX, y: event.clientY };
}

function sampleOf(event: PointerEvent, at: Point): InputSample {
  const angles =
    typeof event.altitudeAngle === "number" &&
    typeof event.azimuthAngle === "number"
      ? { altitudeAngle: event.altitudeAngle, azimuthAngle: event.azimuthAngle }
      : {};
  return {
    x: at.x,
    y: at.y,
    time: event.timeStamp,
    pressure: event.pressure,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    ...angles,
  };
}

/** Moves outside the canvas still reach it, until the pointer lifts. */
function capture(surface: HTMLElement, pointerId: number): void {
  try {
    surface.setPointerCapture(pointerId);
  } catch {
    // A pointer the browser has already let go of: its up event follows.
  }
}
