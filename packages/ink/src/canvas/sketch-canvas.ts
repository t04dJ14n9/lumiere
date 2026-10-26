/**
 * One canvas, open over the whole window until Done or Cancel: the page and
 * its strokes, their own undo history, the palette, the pointer and the
 * keys. Done gives back the drawing and the page's height; Cancel gives
 * nothing, asking first if anything was drawn.
 */
import { emptySketch, type InkStroke, type Sketch } from "../format";
import type { InkRequest } from "../service/ink";
import { StrokeHistory } from "./history";
import { canvasKeyAction, isApplePlatform } from "./keys";
import { FIRST_CHOICE, type ToolChoice } from "./nibs";
import {
  finishedSketch,
  pageHeightHolding,
  pageLayout,
  type PageLayout,
} from "./page";
import {
  fitLayer,
  paintLive,
  paintPage,
  type EraserRing,
  type PageShown,
  type Viewport,
} from "./painter";
import { Palette } from "./palette";
import { PointerInput, type PointerHost } from "./pointer";
import { buildCanvasView, showConfirm, type CanvasView } from "./view";

/** Room below the page to draw into, at least, in CSS pixels: the page grows into it. */
const ROOM_BELOW = 240;
/** Room under everything, so the page scrolls clear of the floating tools. */
const PALETTE_ROOM = 88;

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
  private readonly history: StrokeHistory;
  private readonly palette: Palette;
  private readonly pointer: PointerInput;
  private readonly layers: {
    readonly base: CanvasRenderingContext2D;
    readonly live: CanvasRenderingContext2D;
  };
  private readonly listening = new AbortController();
  private readonly resizing = new ResizeObserver(() => this.relayout());
  private pageHeight: number;
  private layout: PageLayout = { scale: 1, left: 0, top: 0 };
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
    this.pageHeight = this.sketch.height;
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
    this.view.sheet.focus({ preventScroll: true });
  }

  private listen(): void {
    const { view } = this;
    const options = { signal: this.listening.signal };
    view.done.addEventListener("click", () => this.done(), options);
    view.cancel.addEventListener("click", () => this.cancel(), options);
    view.undo.addEventListener("click", () => this.undo(), options);
    view.redo.addEventListener("click", () => this.redo(), options);
    view.confirm.discard.addEventListener(
      "click",
      () => this.finish(undefined),
      options,
    );
    view.confirm.keep.addEventListener(
      "click",
      () => this.keepDrawing(),
      options,
    );
    view.scroller.addEventListener(
      "scroll",
      () => this.schedule(true),
      options,
    );
    view.dialog.addEventListener(
      "keydown",
      (event) => this.key(event),
      options,
    );
    // Escape is handled as a key; the dialog must not close on its own.
    view.dialog.addEventListener(
      "cancel",
      (event) => event.preventDefault(),
      options,
    );
    view.dialog.addEventListener(
      "close",
      () => {
        if (!this.isFinished) {
          view.dialog.showModal();
        }
      },
      options,
    );
    this.resizing.observe(view.scroller);
  }

  private pointerHost(): PointerHost {
    return {
      sheet: this.view.sheet,
      scroller: this.view.scroller,
      scale: () => this.layout.scale,
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
    } else if (action === "undo") {
      this.undo();
    } else if (action === "redo") {
      this.redo();
    } else if (action === "done") {
      this.done();
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
    this.growPage();
    this.schedule(true);
  }

  private shownStrokes(): readonly InkStroke[] {
    const { strokes } = this.history;
    return this.erasing.size === 0
      ? strokes
      : strokes.filter((stroke) => !this.erasing.has(stroke));
  }

  /** Strokes drawn below the page take the page down with them; it never shrinks. */
  private growPage(): void {
    const height = pageHeightHolding(this.history.strokes, this.pageHeight);
    if (height > this.pageHeight) {
      this.pageHeight = height;
      this.relayout();
    }
  }

  private relayout(): void {
    const { scroller, sheet, content } = this.view;
    this.layout = pageLayout(scroller.clientWidth, this.sketch.width);
    const { scale, left, top } = this.layout;
    const page = this.pageHeight * scale;
    const below = Math.max(ROOM_BELOW, scroller.clientHeight / 2);
    Object.assign(sheet.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${this.sketch.width * scale}px`,
      height: `${page + below}px`,
    });
    content.style.height = `${top + page + below + PALETTE_ROOM}px`;
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
    if (this.isFinished) {
      return;
    }
    const viewport = this.viewport();
    const page = this.page();
    if (this.isBaseStale) {
      this.isBaseStale = false;
      fitLayer(this.view.base, viewport);
      paintPage(this.layers.base, viewport, page, this.shownStrokes());
    }
    fitLayer(this.view.live, viewport);
    paintLive(this.layers.live, viewport, page, this.live);
  }

  private viewport(): Viewport {
    const { scroller } = this.view;
    return {
      width: scroller.clientWidth,
      height: scroller.clientHeight,
      scrollTop: scroller.scrollTop,
      ratio: window.devicePixelRatio || 1,
      layout: this.layout,
    };
  }

  private page(): PageShown {
    const { width, paper } = this.sketch;
    return { width, height: this.pageHeight, paper };
  }

  private done(): void {
    this.finish(
      finishedSketch(this.sketch, this.history.strokes, this.pageHeight),
    );
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
    this.view.sheet.focus({ preventScroll: true });
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
