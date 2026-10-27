import assert from "node:assert/strict";
import test from "node:test";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import type { Extension, TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createRoot } from "@workshop/core";
import { createViewState } from "./view-state";
import { registerViewPersistence } from "./persistence";
import { ViewContributions } from "./contributions";
import { viewState } from "./protocol";

type ScrollMeasurement = NonNullable<
  Parameters<EditorView["requestMeasure"]>[0]
>;

/**
 * A scroller that, as a browser's, keeps its position between 0 and
 * `maxScrollTop`, and records how it is listened to. Events dispatched on it
 * land outside the text: in a margin, a gutter or on the scrollbar.
 */
class FakeScroller extends EventTarget {
  scrollLeft = 0;
  maxScrollTop = Infinity;
  readonly listened: { type: string; options: unknown }[] = [];
  #scrollTop: number;

  constructor(scrollTop: number) {
    super();
    this.#scrollTop = scrollTop;
  }

  get scrollTop(): number {
    return this.#scrollTop;
  }

  set scrollTop(value: number) {
    this.#scrollTop = Math.min(Math.max(value, 0), this.maxScrollTop);
  }

  getBoundingClientRect() {
    return { top: 0 };
  }

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    this.listened.push({ type, options });
    super.addEventListener(type, listener, options);
  }
}

/**
 * A panel restored to line 0 at the top, which starts at 720 px. With
 * `codeMirrorAnchors`, its measurements end as CodeMirror's do: the line at
 * the top of the view (the restored one) is held where it was on screen.
 */
function restoredPanel(
  presentation: ReturnType<typeof createViewState>,
  { codeMirrorAnchors = false } = {},
) {
  let state = EditorState.create({
    doc: "note",
    extensions: presentation.restoreScrollPosition,
  });
  const geometry = { top: 720 };
  const scrollDOM = new FakeScroller(600);
  const measures: ScrollMeasurement[] = [];
  const view = {
    get state() {
      return state;
    },
    get documentTop() {
      return -scrollDOM.scrollTop;
    },
    scaleY: 1,
    scrollDOM,
    lineBlockAt: () => geometry,
    requestMeasure(request: ScrollMeasurement) {
      measures.push(request);
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  /** Restore, and let CodeMirror scroll to the restored line. */
  const restore = () => {
    presentation.restoreViewState(
      view,
      viewState.parse({
        anchor: 0,
        head: 0,
        scrollTop: 600,
        scrollAnchor: { from: 0, offset: 0 },
        mode: "livePreview",
      }),
    );
    const handler = state.facet(EditorView.scrollHandler)[0]!;
    assert.equal(
      handler(view, EditorSelection.cursor(0), {
        x: "nearest",
        y: "start",
        xMargin: 0,
        yMargin: 0,
      }),
      true,
    );
  };
  restore();
  let anchoredTop = geometry.top;
  return {
    view,
    geometry,
    scrollDOM,
    restore,
    /**
     * Run CodeMirror's next measurement: the queued pin corrections, and
     * then what is queued to run after it, before the frame is painted.
     */
    async flushMeasurements() {
      for (const request of measures) {
        request.write?.(request.read(view), view);
      }
      if (codeMirrorAnchors) {
        scrollDOM.scrollTop += geometry.top - anchoredTop;
      }
      anchoredTop = geometry.top;
      await Promise.resolve();
    },
  };
}

test("widget scroll input cancels applied restore and queued layout correction only in its panel", async () => {
  const root = createRoot();
  const presentation = createViewState(root);
  const first = restoredPanel(presentation);
  const second = restoredPanel(presentation);
  const firstTop = first.scrollDOM.scrollTop;
  const secondTop = second.scrollDOM.scrollTop;
  root.emit("editor/scrollInput", first.view);
  first.geometry.top += 60;
  second.geometry.top += 60;
  await first.flushMeasurements();
  await second.flushMeasurements();
  assert.equal(first.scrollDOM.scrollTop, firstTop);
  assert.equal(second.scrollDOM.scrollTop, secondTop + 60);
  await root.dispose();
});

test("scrolling away from a restored line keeps content growing above it from pulling the view back", async () => {
  const root = createRoot();
  const presentation = createViewState(root);
  // A wheel over a margin, a scrollbar drag, PageDown outside the text.
  const scrolled = restoredPanel(presentation);
  scrolled.scrollDOM.scrollTop += 300;
  scrolled.scrollDOM.dispatchEvent(new Event("scroll"));
  // CodeMirror measures before the scroll event arrives.
  const measuredFirst = restoredPanel(presentation);
  measuredFirst.scrollDOM.scrollTop += 300;
  for (const panel of [scrolled, measuredFirst]) {
    const readerTop = panel.scrollDOM.scrollTop;
    panel.geometry.top += 60;
    await panel.flushMeasurements();
    panel.scrollDOM.dispatchEvent(new Event("scroll"));
    panel.geometry.top += 60;
    await panel.flushMeasurements();
    assert.equal(panel.scrollDOM.scrollTop, readerTop);
  }
  await root.dispose();
});

test("the restored line stays pinned through its own corrections, even where the browser clamps them", async () => {
  const root = createRoot();
  const presentation = createViewState(root);
  const panel = restoredPanel(presentation);
  panel.scrollDOM.dispatchEvent(new Event("scroll"));
  panel.geometry.top += 60;
  await panel.flushMeasurements();
  panel.scrollDOM.dispatchEvent(new Event("scroll"));
  assert.equal(panel.scrollDOM.scrollTop, 780);

  // The note below is not measured yet, so it cannot scroll as far as the pin asks.
  panel.scrollDOM.maxScrollTop = 800;
  panel.geometry.top += 40;
  await panel.flushMeasurements();
  panel.scrollDOM.dispatchEvent(new Event("scroll"));
  assert.equal(panel.scrollDOM.scrollTop, 800);

  panel.scrollDOM.maxScrollTop = Infinity;
  panel.geometry.top += 10;
  await panel.flushMeasurements();
  assert.equal(panel.scrollDOM.scrollTop, 830);
  await root.dispose();
});

test("reader input anywhere in the scroller ends the pin, and never makes scrolling wait", async () => {
  const root = createRoot();
  const presentation = createViewState(root);
  const panel = restoredPanel(presentation);
  for (const type of ["wheel", "touchstart", "pointerdown", "keydown"]) {
    panel.restore();
    const readerTop = panel.scrollDOM.scrollTop;
    panel.scrollDOM.dispatchEvent(new Event(type));
    panel.geometry.top += 60;
    await panel.flushMeasurements();
    assert.equal(panel.scrollDOM.scrollTop, readerTop, type);
  }
  const waitedFor = panel.scrollDOM.listened.filter(
    ({ options }) =>
      typeof options !== "object" ||
      !(options as AddEventListenerOptions).passive,
  );
  assert.deepEqual(waitedFor, []);
  await root.dispose();
});

/** A panel scrolled to 600 px, its top line (at 40) starting 10 px above. */
function scrolledPanel(presentation: ReturnType<typeof createViewState>) {
  let state = EditorState.create({
    doc: "x".repeat(100),
    extensions: presentation.restoreScrollPosition,
  });
  const line = { from: 40, top: 590 };
  const scrollDOM = new FakeScroller(600);
  const dispatched: TransactionSpec[] = [];
  const view = {
    get state() {
      return state;
    },
    get documentTop() {
      return -scrollDOM.scrollTop;
    },
    scaleY: 1,
    scrollDOM,
    lineBlockAt: () => line,
    lineBlockAtHeight: () => line,
    requestMeasure() {},
    dispatch(spec: TransactionSpec) {
      dispatched.push(spec);
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  const scroll = (head: number) =>
    state.facet(EditorView.scrollHandler)[0]!(
      view,
      EditorSelection.cursor(head),
      { x: "nearest", y: "start", xMargin: 0, yMargin: 0 },
    );
  return { view, line, scrollDOM, dispatched, scroll };
}

test("turning a plugin on or off keeps the line at the top of the viewport in place", async () => {
  const root = createRoot();
  const presentation = createViewState(root);
  const panel = scrolledPanel(presentation);
  let changed = false;
  presentation.keepPlace(panel.view, () => {
    changed = true;
    // Reconfiguring re-estimated the heights above: the line moved up 140 px.
    panel.line.top = 450;
  });
  assert.equal(changed, true);
  assert.equal(panel.dispatched.length, 1);
  assert.equal(panel.scroll(40), true);
  assert.equal(panel.line.top - panel.scrollDOM.scrollTop, -10);

  // Turned back on while layout settles: the same line stays pinned.
  presentation.keepPlace(panel.view, () => (panel.line.top = 520));
  assert.equal(panel.dispatched.length, 2);
  assert.equal(panel.scroll(40), true);
  assert.equal(panel.line.top - panel.scrollDOM.scrollTop, -10);
  await root.dispose();
});

test("keeping the place leaves a view at the top, and a restore on its way, alone", async () => {
  const root = createRoot();
  const presentation = createViewState(root);
  const top = scrolledPanel(presentation);
  top.scrollDOM.scrollTop = 0;
  presentation.keepPlace(top.view, () => {});
  assert.equal(top.dispatched.length, 0);

  const restoring = scrolledPanel(presentation);
  presentation.restoreViewState(
    restoring.view,
    viewState.parse({
      anchor: 0,
      head: 0,
      scrollTop: 0,
      scrollAnchor: { from: 70, offset: 0 },
      mode: "livePreview",
    }),
  );
  let changed = false;
  presentation.keepPlace(restoring.view, () => (changed = true));
  assert.equal(changed, true);
  assert.equal(restoring.dispatched.length, 1, "only the restore's dispatch");
  // The restore still lands where it was going.
  assert.equal(restoring.scroll(70), true);
  await root.dispose();
});

test("scroll events coalesce through debounced checkpoint and flush on dispose", async () => {
  const root = createRoot();
  const presentation = createViewState(root);
  const compartment = new Compartment();
  let state = EditorState.create({
    doc: "line 1\nline 2\nline 3",
    extensions: [compartment.of([])],
  });
  const scrollListeners = new Map<
    string,
    { fn: () => void; options?: unknown }
  >();
  const windowListeners = new Map<string, () => void>();
  const scrollDOM = {
    scrollTop: 0,
    scrollLeft: 0,
    getBoundingClientRect: () => ({ top: 0 }),
    addEventListener(type: string, fn: () => void, options?: unknown) {
      scrollListeners.set(type, { fn, options });
    },
    removeEventListener(type: string) {
      scrollListeners.delete(type);
    },
  };
  const view = {
    get state() {
      return state;
    },
    get documentTop() {
      return -scrollDOM.scrollTop;
    },
    scaleY: 1,
    scrollDOM,
    dom: {
      ownerDocument: {
        defaultView: {
          addEventListener(type: string, fn: () => void) {
            windowListeners.set(type, fn);
          },
          removeEventListener(type: string) {
            windowListeners.delete(type);
          },
        },
      },
    },
    lineBlockAtHeight: () => ({ from: 7, top: 20 }),
    lineBlockAt: () => ({ from: 7, top: 20 }),
    requestMeasure() {},
  } as unknown as EditorView;
  const contributions = new ViewContributions(view);
  const persisted: unknown[] = [];
  const cleanups: Array<() => void> = [];
  registerViewPersistence(
    {
      effect(fn: () => (() => void) | void) {
        const cleanup = fn();
        if (typeof cleanup === "function") {
          cleanups.push(cleanup);
        }
      },
      emit() {},
      logger: { warn() {}, info() {}, error() {}, debug() {} },
      document: { flush: async () => {} },
      rpc: { handle: () => () => {} },
    } as never,
    {
      view,
      source: "line 1\nline 2\nline 3",
      mode: "livePreview",
      extend(ext: Extension) {
        state = state.update({
          effects: compartment.reconfigure(ext),
        }).state;
        return () => {};
      },
    } as never,
    { presentation, contributions },
    { persist: (saved) => persisted.push(saved) },
  );
  const scrollEntry = scrollListeners.get("scroll");
  assert.ok(scrollEntry);
  assert.deepEqual(scrollEntry.options, { passive: true });
  for (let i = 1; i <= 10; i++) {
    scrollDOM.scrollTop = i * 24;
    scrollEntry.fn();
  }
  // Raw 60-120Hz scroll events must not synchronously call persist()
  assert.equal(persisted.length, 0);
  // Disposing while a scroll checkpoint is pending flushes the latest scrollTop
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
  await root.dispose();
  assert.equal(persisted.length, 1);
  assert.equal((persisted[0] as { scrollTop: number }).scrollTop, 240);
});

test("content growing above the restored line is undone once, CodeMirror's anchoring and the pin together", async () => {
  const root = createRoot();
  const presentation = createViewState(root);
  const panel = restoredPanel(presentation, { codeMirrorAnchors: true });
  const restoredTop = panel.scrollDOM.scrollTop;
  // An image above the line loads, 882 px tall.
  panel.geometry.top += 882;
  await panel.flushMeasurements();
  panel.scrollDOM.dispatchEvent(new Event("scroll"));
  assert.equal(panel.scrollDOM.scrollTop, restoredTop + 882);
  // Still pinned: a later change is still held.
  panel.geometry.top += 40;
  await panel.flushMeasurements();
  assert.equal(panel.scrollDOM.scrollTop, restoredTop + 922);
  await root.dispose();
});
