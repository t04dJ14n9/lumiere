import assert from "node:assert/strict";
import { test } from "node:test";
import { parseViewerMessage } from "../../src/shared/messages";
import {
  parseReadingPosition,
  positionFromView,
} from "../../src/shared/reading-position";
import {
  isDiscreteWheel,
  motionProgress,
  wheelPixels,
  wheelTarget,
} from "../../src/shared/smooth-motion";
import {
  DEFAULT_VIEW_CHOICES,
  parseDefaultZoom,
  parseViewSettings,
  resolveSmoothScrolling,
} from "../../src/shared/view-settings";
import { parseViewerAction, parseViewState } from "../../src/shared/view-state";
import { pageAxisBounds } from "../../src/shared/page-window";

const view = {
  ...DEFAULT_VIEW_CHOICES,
  page: 3,
  pageCount: 12,
  zoomPercent: 125,
  fit: null,
  tool: "text",
  canGoBack: true,
  canGoForward: true,
  readingPage: 3,
  zoom: 125,
  top: 20,
  left: 8,
} as const;

test("view reports preserve layout, scrolling and exact reading offsets across the trust boundary", () => {
  const report = {
    ...view,
    pageLayout: "spreadCover",
    scrollMode: "paged",
    scrollDirection: "horizontal",
  } as const;
  assert.deepEqual(parseViewState(report), report);
  assert.deepEqual(
    parseViewerMessage({
      type: "patch",
      version: 1,
      load: 1,
      patch: { view: report },
    }),
    { type: "patch", version: 1, load: 1, patch: { view: report } },
  );
  for (const bad of [
    { pageLayout: "book" },
    { scrollMode: "snap" },
    { scrollDirection: "diagonal" },
    { top: -1 },
    { left: Infinity },
  ]) {
    assert.equal(parseViewState({ ...view, ...bad }), undefined);
    assert.equal(
      parseViewerMessage({
        type: "patch",
        version: 1,
        load: 1,
        patch: { view: { ...view, ...bad } },
      }),
      undefined,
    );
  }
});

test("new view actions accept only the supported choices", () => {
  for (const action of [
    { action: "actualSize" },
    ...["single", "spread", "spreadCover"].map((pageLayout) => ({
      action: "setPageLayout",
      pageLayout,
    })),
    ...["continuous", "paged"].map((scrollMode) => ({
      action: "setScrollMode",
      scrollMode,
    })),
    ...["vertical", "horizontal"].map((scrollDirection) => ({
      action: "setScrollDirection",
      scrollDirection,
    })),
  ])
    assert.deepEqual(parseViewerAction({ ...action, extra: true }), action);
  for (const action of [
    { action: "setPageLayout", pageLayout: "book" },
    { action: "setScrollMode", scrollMode: true },
    { action: "setScrollDirection", scrollDirection: 0 },
    { action: "setPageLayout" },
  ])
    assert.equal(parseViewerAction(action), undefined);
});

test("view settings parse defaults, percentages and malformed configuration without coercion", () => {
  assert.deepEqual(parseViewSettings(null), {
    ...DEFAULT_VIEW_CHOICES,
    defaultZoom: "fitWidth",
    smoothScrolling: null,
  });
  const settings = {
    defaultZoom: "actual",
    pageLayout: "spread",
    scrollMode: "paged",
    scrollDirection: "horizontal",
    smoothScrolling: false,
  };
  assert.deepEqual(parseViewSettings(settings), settings);
  for (const value of ["fitWidth", "fitPage", "actual", 62.5] as const)
    assert.equal(parseDefaultZoom(value), value);
  assert.equal(parseDefaultZoom(10), 25);
  assert.equal(parseDefaultZoom(500), 400);
  for (const value of ["125", "fit-page", 0, -1, NaN, Infinity])
    assert.equal(parseDefaultZoom(value), "fitWidth");
  assert.deepEqual(
    parseViewSettings({
      defaultZoom: {},
      pageLayout: "book",
      scrollMode: "snap",
      scrollDirection: "diagonal",
      smoothScrolling: "false",
    }),
    parseViewSettings(null),
  );
});

test("reading positions round-trip all view choices and validate saved data", () => {
  const saved = {
    page: 3,
    top: 20,
    left: 8,
    zoom: 125,
    ...DEFAULT_VIEW_CHOICES,
  };
  assert.deepEqual(positionFromView(view), saved);
  assert.deepEqual(parseReadingPosition(saved), saved);
  assert.deepEqual(
    positionFromView({
      ...view,
      page: 4,
      readingPage: 3,
      zoomPercent: 63,
      zoom: 62.5,
    }),
    { ...saved, zoom: 62.5 },
  );
  assert.equal(
    positionFromView({ ...view, fit: "page", zoom: "fitPage" }).zoom,
    "fitPage",
  );
  assert.equal(
    positionFromView({ ...view, fit: "width", zoom: "fitWidth" }).zoom,
    "fitWidth",
  );
  for (const bad of [
    null,
    { ...saved, page: 0 },
    { ...saved, page: 1.5 },
    { ...saved, zoom: NaN },
    { ...saved, top: 1_000_001 },
    { ...saved, scrollMode: "snap" },
  ]) {
    assert.equal(parseReadingPosition(bad), undefined);
  }
});

test("smooth motion follows the editor unless overridden, and reduced motion always wins", () => {
  for (const reduced of [false, true]) {
    assert.equal(resolveSmoothScrolling(null, true, reduced), !reduced);
    assert.equal(resolveSmoothScrolling(true, false, reduced), !reduced);
    assert.equal(resolveSmoothScrolling(false, true, reduced), false);
    assert.equal(resolveSmoothScrolling(null, false, reduced), false);
    assert.equal(resolveSmoothScrolling("true", undefined, reduced), false);
  }
});

test("discrete wheel detection leaves fractional, small and diagonal trackpad pixels native", () => {
  const wheel = (deltaY: number, deltaMode = 0, deltaX = 0) => ({
    deltaX,
    deltaY,
    deltaMode,
  });
  for (const delta of [100, -120, 240, -300])
    assert.equal(isDiscreteWheel(wheel(delta)), true);
  assert.equal(isDiscreteWheel(wheel(3, 1)), true);
  assert.equal(isDiscreteWheel(wheel(1, 2)), true);
  for (const delta of [0, 1.5, 24, 80, 101, NaN])
    assert.equal(isDiscreteWheel(wheel(delta)), false);
  assert.equal(isDiscreteWheel(wheel(100, 0, 1)), false);
  assert.equal(wheelPixels(3, 1, 600), 120);
  assert.equal(wheelPixels(-1, 2, 600), -600);
  assert.equal(wheelPixels(2.5, 0, 600), 2.5);
});

test("wheel animation accumulates, reverses promptly, clamps edges and finishes without overshoot", () => {
  assert.equal(wheelTarget(20, 100, 100, 0, 500), 200);
  assert.equal(wheelTarget(20, 100, -100, 0, 500), 0);
  assert.equal(wheelTarget(400, 490, 100, 0, 500), 500);
  assert.equal(motionProgress(-5), 0);
  assert.equal(motionProgress(0), 0);
  assert.equal(motionProgress(70), 0.875);
  assert.equal(motionProgress(140), 1);
  assert.equal(motionProgress(400), 1);
  let previous = 0;
  for (let elapsed = 0; elapsed <= 140; elapsed++) {
    const progress = motionProgress(elapsed);
    assert.ok(progress >= previous && progress <= 1);
    previous = progress;
  }
});

test("page-by-page panning stays inside a native item, including at document edges", () => {
  assert.deepEqual(pageAxisBounds(1000, 1600, 600, 5000), {
    min: 1000,
    max: 2000,
  });
  assert.deepEqual(pageAxisBounds(1000, 400, 600, 5000), {
    min: 1000,
    max: 1000,
  });
  assert.deepEqual(pageAxisBounds(4600, 400, 600, 5000), {
    min: 4400,
    max: 4400,
  });
  assert.deepEqual(pageAxisBounds(0, 400, 600, 400), { min: 0, max: 0 });
});
