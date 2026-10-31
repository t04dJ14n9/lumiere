import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { RegionSelection } from "../../src/shared/selection";

/**
 * Load SelectionTracker with a fake host so we can assert report patches
 * without acquireVsCodeApi.
 */
function loadSelectionTracker(reports: unknown[]) {
  const source = readFileSync(
    new URL("../../src/webview/selection.ts", import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  const evaluate = runInNewContext(
    `(function(require, module, exports) { ${output}\n})`,
    { console },
  ) as (
    require: (id: string) => unknown,
    module: { exports: Record<string, unknown> },
    exports: Record<string, unknown>,
  ) => void;
  evaluate(
    (id) => {
      if (id === "react") {
        return {
          useCallback: (fn: unknown) => fn,
          useEffect: () => undefined,
          useRef: (value: unknown) => ({ current: value }),
          useState: (value: unknown) => [value, () => undefined],
        };
      }
      if (id === "@embedpdf/core/react") {
        return { useRegistry: () => ({ registry: undefined }) };
      }
      if (id === "@embedpdf/plugin-selection/react") {
        return { useSelectionCapability: () => ({ provides: undefined }) };
      }
      if (id === "./editable-target") {
        return { isEditableTarget: () => false };
      }
      if (id === "./host") {
        return {
          postToHost: () => undefined,
          reportToHost: (patch: unknown) => reports.push(patch),
        };
      }
      if (id === "./menu-context") {
        return { followMenuContext: () => () => undefined };
      }
      if (id === "./region-details") {
        return {
          readRegionDetails: () =>
            Promise.resolve({ text: "from page", image: undefined }),
        };
      }
      throw new Error(`Unexpected runtime dependency: ${id}`);
    },
    module,
    module.exports,
  );
  const SelectionTracker = module.exports.SelectionTracker as new (
    setRegion: (region: RegionSelection | undefined) => void,
  ) => {
    region: RegionSelection | undefined;
    changeRegion(next: RegionSelection | undefined): void;
    setAnnotationRegion(
      next: RegionSelection | undefined,
      enrich?: { engine: unknown; pdf: unknown },
    ): void;
    reportSelection(scope: unknown): Promise<void>;
    follow(
      scope: unknown,
      source: { engine: () => unknown; pdf: unknown },
    ): () => void;
  };
  assert.equal(
    typeof SelectionTracker,
    "function",
    "SelectionTracker must be exported for annotation region wiring",
  );
  return SelectionTracker;
}

function mockSelectionScope() {
  let onSelectionChange: ((range: unknown) => void) | undefined;
  let onEmptySpaceClick: (() => void) | undefined;
  let onMarqueeChange:
    | ((event: { rect: unknown }) => void)
    | undefined;
  let onMarqueeEnd:
    | ((event: { pageIndex: number; rect: { origin: { x: number; y: number }; size: { width: number; height: number } } }) => void)
    | undefined;
  return {
    scope: {
      onEndSelection: () => () => undefined,
      onSelectionChange: (listener: (range: unknown) => void) => {
        onSelectionChange = listener;
        return () => undefined;
      },
      onMarqueeChange: (listener: (event: { rect: unknown }) => void) => {
        onMarqueeChange = listener;
        return () => undefined;
      },
      onMarqueeEnd: (
        listener: (event: {
          pageIndex: number;
          rect: {
            origin: { x: number; y: number };
            size: { width: number; height: number };
          };
        }) => void,
      ) => {
        onMarqueeEnd = listener;
        return () => undefined;
      },
      onEmptySpaceClick: (listener: () => void) => {
        onEmptySpaceClick = listener;
        return () => undefined;
      },
      getState: () => ({ selection: undefined }),
      clear: () => undefined,
    },
    /** Simulate EmbedPDF clearing text selection. */
    clearText: () => onSelectionChange?.(null),
    /** Simulate a click on empty page space. */
    emptySpaceClick: () => onEmptySpaceClick?.(),
    /**
     * Simulate Select Region marquee cancel (rect cleared without a prior
     * onMarqueeEnd).
     */
    marqueeCancel: () => onMarqueeChange?.({ rect: null }),
    /** Simulate finishing a marquee drag that draws a region. */
    marqueeEnd: (pageIndex = 0) =>
      onMarqueeEnd?.({
        pageIndex,
        rect: {
          origin: { x: 10, y: 20 },
          size: { width: 40, height: 30 },
        },
      }),
  };
}

const annotationRegion: RegionSelection = {
  kind: "region",
  page: 1,
  rect: [74, 90, 205, 110],
  text: "Synthetic page 1",
};

test("annotation region survives a later textCleared (no null wipe)", () => {
  const reports: unknown[] = [];
  const SelectionTracker = loadSelectionTracker(reports);
  const regions: Array<RegionSelection | undefined> = [];
  const tracker = new SelectionTracker((region) => regions.push(region));
  const { scope, clearText } = mockSelectionScope();
  tracker.follow(scope, { engine: () => undefined, pdf: {} });

  tracker.setAnnotationRegion(annotationRegion);
  assert.deepEqual(tracker.region, annotationRegion);
  const before = reports.length;
  clearText();
  assert.deepEqual(tracker.region, annotationRegion);
  assert.equal(
    reports.length,
    before,
    "textCleared must not report null while an annotation region is active",
  );
  const last = reports.at(-1) as { selection?: { selection?: unknown } };
  assert.notEqual(last?.selection?.selection, null);
});

test("reportSelection with no text selection awaits active annotation region", async () => {
  const reports: unknown[] = [];
  const SelectionTracker = loadSelectionTracker(reports);
  const tracker = new SelectionTracker(() => undefined);
  tracker.setAnnotationRegion(annotationRegion, {
    engine: {},
    pdf: { id: "doc" },
  });
  assert.deepEqual(tracker.region, annotationRegion);
  await tracker.reportSelection({
    getState: () => ({ selection: undefined }),
  });
  assert.ok(tracker.region);
  assert.equal(tracker.region?.kind, "region");
  // After enrich, quote should prefer page text from readRegionDetails.
  assert.equal(tracker.region?.text, "from page");
});

test("clearing annotation region reports null through the tracker path", () => {
  const reports: unknown[] = [];
  const SelectionTracker = loadSelectionTracker(reports);
  const tracker = new SelectionTracker(() => undefined);
  tracker.setAnnotationRegion(annotationRegion);
  tracker.setAnnotationRegion(undefined);
  const last = reports.at(-1) as { selection?: { selection?: unknown } };
  assert.equal(last?.selection?.selection, null);
  assert.equal(tracker.region, undefined);
});

test("empty-space click does not clear an annotation-owned region", () => {
  const reports: unknown[] = [];
  const SelectionTracker = loadSelectionTracker(reports);
  const tracker = new SelectionTracker(() => undefined);
  const { scope, emptySpaceClick } = mockSelectionScope();
  tracker.follow(scope, { engine: () => undefined, pdf: {} });

  tracker.setAnnotationRegion(annotationRegion);
  const before = reports.length;
  emptySpaceClick();
  assert.deepEqual(tracker.region, annotationRegion);
  assert.equal(
    reports.length,
    before,
    "empty-space click must not wipe annotation region / host snapshot",
  );
});

test("marquee-cancel does not clear an annotation-owned region", () => {
  const reports: unknown[] = [];
  const SelectionTracker = loadSelectionTracker(reports);
  const tracker = new SelectionTracker(() => undefined);
  const { scope, marqueeCancel } = mockSelectionScope();
  tracker.follow(scope, { engine: () => undefined, pdf: {} });

  tracker.setAnnotationRegion(annotationRegion);
  const before = reports.length;
  marqueeCancel();
  assert.deepEqual(tracker.region, annotationRegion);
  assert.equal(
    reports.length,
    before,
    "marquee-cancel must not wipe annotation region / host snapshot",
  );
});

test("empty-space click still clears a marquee (non-annotation) region", () => {
  const reports: unknown[] = [];
  const SelectionTracker = loadSelectionTracker(reports);
  const tracker = new SelectionTracker(() => undefined);
  const { scope, emptySpaceClick, marqueeEnd } = mockSelectionScope();
  tracker.follow(scope, { engine: () => undefined, pdf: {} });

  marqueeEnd(0);
  assert.ok(tracker.region);
  assert.equal(tracker.region?.kind, "region");
  emptySpaceClick();
  assert.equal(tracker.region, undefined);
  const last = reports.at(-1) as { selection?: { selection?: unknown } };
  assert.equal(last?.selection?.selection, null);
});

test("marquee-cancel still clears a marquee (non-annotation) region", () => {
  const reports: unknown[] = [];
  const SelectionTracker = loadSelectionTracker(reports);
  const tracker = new SelectionTracker(() => undefined);
  const { scope, marqueeCancel, marqueeEnd } = mockSelectionScope();
  tracker.follow(scope, { engine: () => undefined, pdf: {} });

  marqueeEnd(0);
  assert.ok(tracker.region);
  // After marqueeEnd, EmbedPDF also clears marquee rect; that must not
  // immediately wipe the region we just set (marqueeEnded guard).
  marqueeCancel();
  assert.ok(tracker.region, "post-end marquee clear is ignored once");
  // A later cancel without a new end (e.g. Select Region tool click) clears.
  marqueeCancel();
  assert.equal(tracker.region, undefined);
  const last = reports.at(-1) as { selection?: { selection?: unknown } };
  assert.equal(last?.selection?.selection, null);
});
