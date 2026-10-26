/**
 * The pointer on the page: a pen, a mouse or a finger draws, or erases
 * with the eraser (or a pen's eraser end). As on the iPad, once a pen has
 * drawn a finger scrolls instead, and a finger already drawing when a pen
 * comes down was a palm, so its stroke is dropped.
 *
 * Each move reads the samples the browser coalesced into it, so a fast pen
 * keeps every point it reported, not one per frame.
 */
import type { InkStroke } from "../format";
import { strokesTouched, type Point } from "./erase";
import type { InputSample } from "./input";
import { chosenInk, ERASER_RADIUS, type ToolChoice } from "./nibs";
import type { EraserRing } from "./painter";
import { StrokeRecorder } from "./recorder";

/** Pointer Events' button for a pen's eraser end (or its eraser button). */
const ERASER_BUTTON = 5;

export interface PointerHost {
  /** Where the pointer draws: its top left is the page's. */
  readonly sheet: HTMLElement;
  readonly scroller: HTMLElement;
  /** CSS pixels per point of the sketch, now. */
  scale(): number;
  /** What the palette has chosen, now. */
  choice(): ToolChoice;
  /** The strokes on the page now, for the eraser. */
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
  | { readonly kind: "scroll"; readonly pointerId: number; lastY: number };

export class PointerInput {
  private gesture: Gesture | undefined;
  private hasPenDrawn = false;
  private readonly listening = new AbortController();

  constructor(private readonly host: PointerHost) {
    const { sheet } = host;
    const options = { signal: this.listening.signal };
    sheet.addEventListener("pointerdown", (event) => this.down(event), options);
    sheet.addEventListener("pointermove", (event) => this.move(event), options);
    sheet.addEventListener("pointerup", (event) => this.up(event), options);
    sheet.addEventListener(
      "pointercancel",
      (event) => this.cancel(event),
      options,
    );
    sheet.addEventListener(
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
    const isEraserEnd =
      event.pointerType === "pen" && event.button === ERASER_BUTTON;
    if ((event.button !== 0 && !isEraserEnd) || !this.letGoOfPalm(event)) {
      return;
    }
    event.preventDefault();
    this.host.sheet.focus({ preventScroll: true });
    capture(this.host.sheet, event.pointerId);
    const { pointerId, pointerType } = event;
    if (pointerType === "touch" && this.hasPenDrawn) {
      this.gesture = { kind: "scroll", pointerId, lastY: event.clientY };
      return;
    }
    this.hasPenDrawn ||= pointerType === "pen";
    const ink = chosenInk(this.host.choice());
    if (!ink || isEraserEnd) {
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
    this.record(recorder, [event]);
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
    const gesture = this.gesture;
    if (!gesture) {
      this.hover(event);
      return;
    }
    if (event.pointerId !== gesture.pointerId) {
      return;
    }
    switch (gesture.kind) {
      case "draw":
        this.record(gesture.recorder, [event]);
        return;
      case "erase":
        for (const sample of this.samples(event, true)) {
          this.eraseTo(sample);
        }
        return;
      case "scroll":
        this.host.scroller.scrollTop += gesture.lastY - event.clientY;
        gesture.lastY = event.clientY;
    }
  }

  private up(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }
    this.gesture = undefined;
    if (gesture.kind === "draw") {
      // Not the up event's own sample: it reads no pressure, and would taper the end.
      this.host.drawing(undefined);
      this.host.drawn(gesture.recorder.stroke());
    } else if (gesture.kind === "erase") {
      this.host.erasingDone();
      this.hover(event);
    }
  }

  /** The browser took the pointer (a gesture, a dialog): a stroke is dropped. */
  private cancel(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }
    this.gesture = undefined;
    if (gesture.kind === "draw") {
      this.host.drawing(undefined);
    } else if (gesture.kind === "erase") {
      this.host.erasingDone();
    }
  }

  private hover(event: PointerEvent): void {
    const isErasing =
      this.host.choice().tool === "eraser" && event.pointerType !== "touch";
    const [at] = isErasing ? this.samples(event, false) : [];
    this.host.eraserAt(at && { ...at, radius: ERASER_RADIUS });
  }

  private record(
    recorder: StrokeRecorder,
    events: readonly PointerEvent[],
  ): void {
    for (const event of events) {
      for (const sample of this.samples(event, true)) {
        recorder.add(sample);
      }
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
    const origin = this.host.sheet.getBoundingClientRect();
    const scale = this.host.scale();
    const coalesced =
      isCoalesced && typeof event.getCoalescedEvents === "function"
        ? event.getCoalescedEvents()
        : [];
    return (coalesced.length > 0 ? coalesced : [event]).map((each) =>
      sampleOf(each, origin, scale),
    );
  }
}

function sampleOf(
  event: PointerEvent,
  origin: DOMRect,
  scale: number,
): InputSample {
  const angles =
    typeof event.altitudeAngle === "number" &&
    typeof event.azimuthAngle === "number"
      ? { altitudeAngle: event.altitudeAngle, azimuthAngle: event.azimuthAngle }
      : {};
  return {
    x: (event.clientX - origin.left) / scale,
    y: (event.clientY - origin.top) / scale,
    time: event.timeStamp,
    pressure: event.pressure,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    ...angles,
  };
}

/** Moves outside the page still reach it, until the pointer lifts. */
function capture(sheet: HTMLElement, pointerId: number): void {
  try {
    sheet.setPointerCapture(pointerId);
  } catch {
    // A pointer the browser has already let go of: its up event follows.
  }
}
