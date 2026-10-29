/**
 * One canvas, open over the whole window until Done or Cancel: the paper
 * and its strokes, their own undo history, the palette, the pointer, the
 * wheel and the keys. The paper has no edge, as Freeform's: the camera
 * pans and zooms over it. Done gives back what was drawn, cut to its
 * strokes (board.ts); Cancel gives nothing, asking first if anything was
 * drawn.
 */
import { emptySketch, type InkStroke, type Sketch } from "../format";
import type { InkRequest } from "../service/ink";
import { savedSketch } from "./board";
import {
  dragged,
  openingCamera,
  pinched,
  toSketch,
  zoomedAt,
  type Camera,
  type ViewPoint,
} from "./camera";
import { StrokeHistory } from "./history";
import { canvasKeyAction, isApplePlatform } from "./keys";
import { listenForNavigation } from "./navigation";
import { FIRST_CHOICE, type ToolChoice } from "./nibs";
import {
  fitLayer,
  paintBoard,
  paintLive,
  type EraserRing,
  type Viewport,
} from "./painter";
import { Palette } from "./palette";
import { PointerInput, type PointerHost } from "./pointer";
import { buildCanvasView, showConfirm, type CanvasView } from "./view";

/** How much ⌘= and ⌘− zoom by. */
const ZOOM_STEP = 1.25;

/** The tools chosen last, while the window lives. */
let remembered: ToolChoice = FIRST_CHOICE;

export function openSketchCanvas(
  request: InkRequest,
  parent: HTMLElement,
): Promise<Sketch | undefined> {
  return new Promise((resolve) => {
    new SketchCanvas(request, resolve).open(parent);
  });
}

class SketchCanvas {
  private readonly view: CanvasView;
  private readonly sketch: Sketch;
  /** A new sketch left blank is not saved. */
  private readonly isNew: boolean;
  private readonly history: StrokeHistory;
  private readonly palette: Palette;
  private readonly pointer: PointerInput;
  private readonly layers: {
    readonly base: CanvasRenderingContext2D;
    readonly live: CanvasRenderingContext2D;
  };
  private readonly listening = new AbortController();
  private readonly resizing = new ResizeObserver(() => this.relayout());
  /** Set once the view has a size: the sketch opens at its own size. */
  private camera: Camera | undefined;
  private isSpaceHeld = false;
  private live: { stroke?: InkStroke; eraser?: EraserRing } = {};
  /** Strokes the eraser has touched while it is still down. */
  private erasing = new Set<InkStroke>();
  private frame: number | undefined;
  private isBaseStale = true;
  private isFinished = false;

  constructor(
    request: InkRequest,
    private readonly resolve: (sketch: Sketch | undefined) => void,
  ) {
    this.sketch = request.sketch ?? emptySketch();
    this.isNew = request.sketch === undefined;
    this.history = new StrokeHistory(this.sketch.strokes);
    this.view = buildCanvasView(request.title);
    this.layers = {
      base: context2d(this.view.base),
      live: context2d(this.view.live),
    };
    this.palette = new Palette(this.view.palette, remembered, (choice) => {
      remembered = choice;
      this.live = {};
      this.schedule(false);
    });
    this.pointer = new PointerInput(this.pointerHost());
  }

  open(parent: HTMLElement): void {
    parent.append(this.view.dialog);
    this.view.dialog.showModal();
    this.listen();
    this.relayout();
    this.view.surface.focus({ preventScroll: true });
  }

  private listen(): void {
    const { view } = this;
    const { signal } = this.listening;
    view.done.addEventListener("click", () => this.done(), { signal });
    view.cancel.addEventListener("click", () => this.cancel(), { signal });
    view.undo.addEventListener("click", () => this.undo(), { signal });
    view.redo.addEventListener("click", () => this.redo(), { signal });
    view.confirm.discard.addEventListener(
      "click",
      () => this.finish(undefined),
      { signal },
    );
    view.confirm.keep.addEventListener("click", () => this.keepDrawing(), {
      signal,
    });
    view.dialog.addEventListener("keydown", (event) => this.key(event), {
      signal,
    });
    view.dialog.addEventListener("keyup", (event) => this.keyUp(event), {
      signal,
    });
    // Escape is handled as a key; the dialog must not close on its own.
    view.dialog.addEventListener("cancel", (event) => event.preventDefault(), {
      signal,
    });
    view.dialog.addEventListener(
      "close",
      () => {
        if (!this.isFinished) {
          view.dialog.showModal();
        }
      },
      { signal },
    );
    listenForNavigation(
      view.surface,
      {
        scroll: (dx, dy) =>
          this.moveCamera((camera) => dragged(camera, -dx, -dy)),
        zoomAt: (client, factor) =>
          this.moveCamera((camera) =>
            zoomedAt(camera, this.inView(client), factor),
          ),
      },
      signal,
    );
    this.resizing.observe(view.surface);
  }

  private pointerHost(): PointerHost {
    return {
      surface: this.view.surface,
      toSketch: (client) =>
        toSketch(
          this.camera ?? openingCamera(this.viewSize(), this.sketch),
          this.inView(client),
        ),
      drag: (dx, dy) => this.moveCamera((camera) => dragged(camera, dx, dy)),
      pinch: (before, after) =>
        this.moveCamera((camera) =>
          pinched(
            camera,
            [this.inView(before[0]), this.inView(before[1])],
            [this.inView(after[0]), this.inView(after[1])],
          ),
        ),
      isPanning: () => this.isSpaceHeld,
      choice: () => this.palette.current,
      strokes: () => this.shownStrokes(),
      drawing: (stroke) => {
        this.live = stroke ? { stroke } : {};
        this.view.live.style.mixBlendMode =
          stroke?.tool === "marker" ? "multiply" : "normal";
        this.schedule(false);
      },
      drawn: (stroke) => this.change([...this.history.strokes, stroke]),
      erased: (strokes) => {
        strokes.forEach((stroke) => this.erasing.add(stroke));
        this.schedule(true);
      },
      erasingDone: () => {
        const erased = this.erasing;
        this.erasing = new Set();
        if (erased.size > 0) {
          this.change(this.history.strokes.filter((item) => !erased.has(item)));
        }
      },
      eraserAt: (eraser) => {
        this.live = eraser ? { eraser } : {};
        this.schedule(false);
      },
    };
  }

  private key(event: KeyboardEvent): void {
    // Keys pressed in the canvas are its own; the window behind it never sees them.
    event.stopPropagation();
    if (event.code === "Space") {
      event.preventDefault();
      this.holdSpace(true);
      return;
    }
    const action = canvasKeyAction({
      key: event.key,
      code: event.code,
      mod: isApplePlatform(navigator.platform) ? event.metaKey : event.ctrlKey,
      shiftKey: event.shiftKey,
    });
    if (!action) {
      return;
    }
    event.preventDefault();
    if (action === "cancel" && this.isConfirming()) {
      this.keepDrawing();
    } else if (action === "cancel") {
      this.cancel();
    } else if (action === "done") {
      this.done();
    } else if (action !== "swallow") {
      this.edit(action);
    }
  }

  private keyUp(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.code === "Space") {
      this.holdSpace(false);
    }
  }

  /** Space held: the mouse pans, as in Freeform and most drawing apps. */
  private holdSpace(isHeld: boolean): void {
    this.isSpaceHeld = isHeld;
    this.view.surface.style.cursor = isHeld ? "grab" : "crosshair";
  }

  private edit(
    action: "undo" | "redo" | "zoomIn" | "zoomOut" | "actualSize",
  ): void {
    const centre = {
      x: this.viewSize().width / 2,
      y: this.viewSize().height / 2,
    };
    switch (action) {
      case "undo":
        return this.undo();
      case "redo":
        return this.redo();
      case "zoomIn":
        return this.moveCamera((camera) => zoomedAt(camera, centre, ZOOM_STEP));
      case "zoomOut":
        return this.moveCamera((camera) =>
          zoomedAt(camera, centre, 1 / ZOOM_STEP),
        );
      case "actualSize":
        return this.moveCamera((camera) =>
          zoomedAt(camera, centre, 1 / camera.zoom),
        );
    }
  }

  private change(strokes: readonly InkStroke[]): void {
    this.history.apply(strokes);
    this.afterChange();
  }

  private undo(): void {
    if (this.history.undo()) {
      this.afterChange();
    }
  }

  private redo(): void {
    if (this.history.redo()) {
      this.afterChange();
    }
  }

  private afterChange(): void {
    this.view.undo.disabled = !this.history.canUndo;
    this.view.redo.disabled = !this.history.canRedo;
    this.schedule(true);
  }

  private shownStrokes(): readonly InkStroke[] {
    const { strokes } = this.history;
    return this.erasing.size === 0
      ? strokes
      : strokes.filter((stroke) => !this.erasing.has(stroke));
  }

  private moveCamera(move: (camera: Camera) => Camera): void {
    if (this.camera) {
      this.camera = move(this.camera);
      this.schedule(true);
    }
  }

  /** A point of the window in the view's own coordinates. */
  private inView(client: ViewPoint): ViewPoint {
    const origin = this.view.surface.getBoundingClientRect();
    return { x: client.x - origin.left, y: client.y - origin.top };
  }

  private viewSize(): { width: number; height: number } {
    const { surface } = this.view;
    return { width: surface.clientWidth, height: surface.clientHeight };
  }

  private relayout(): void {
    const size = this.viewSize();
    if (size.width > 0) {
      this.camera ??= openingCamera(size, this.sketch);
    }
    this.view.undo.disabled = !this.history.canUndo;
    this.view.redo.disabled = !this.history.canRedo;
    this.schedule(true);
  }

  private schedule(isBaseStale: boolean): void {
    this.isBaseStale ||= isBaseStale;
    this.frame ??= requestAnimationFrame(() => {
      this.frame = undefined;
      this.paint();
    });
  }

  private paint(): void {
    const { camera } = this;
    if (this.isFinished || !camera) {
      return;
    }
    const viewport: Viewport = {
      ...this.viewSize(),
      ratio: window.devicePixelRatio || 1,
      camera,
    };
    if (this.isBaseStale) {
      this.isBaseStale = false;
      fitLayer(this.view.base, viewport);
      paintBoard(
        this.layers.base,
        viewport,
        this.sketch.paper,
        this.shownStrokes(),
      );
    }
    fitLayer(this.view.live, viewport);
    paintLive(this.layers.live, viewport, this.live);
  }

  private done(): void {
    this.finish(savedSketch(this.sketch, this.history.strokes, this.isNew));
  }

  private cancel(): void {
    if (!this.history.isChanged) {
      this.finish(undefined);
      return;
    }
    showConfirm(this.view.confirm, true);
    this.view.confirm.keep.focus();
  }

  private isConfirming(): boolean {
    return this.view.confirm.panel.style.display !== "none";
  }

  private keepDrawing(): void {
    showConfirm(this.view.confirm, false);
    this.view.surface.focus({ preventScroll: true });
  }

  private finish(sketch: Sketch | undefined): void {
    if (this.isFinished) {
      return;
    }
    this.isFinished = true;
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
    }
    this.pointer.dispose();
    this.listening.abort();
    this.resizing.disconnect();
    this.view.dialog.close();
    this.view.dialog.remove();
    this.resolve(sketch);
  }
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser cannot draw on a canvas.");
  }
  return context;
}
