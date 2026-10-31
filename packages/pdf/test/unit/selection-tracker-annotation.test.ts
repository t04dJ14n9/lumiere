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
  return {
    scope: {
      onEndSelection: () => () => undefined,
      onSelectionChange: (listener: (range: unknown) => void) => {
        onSelectionChange = listener;
        return () => undefined;
      },
      onMarqueeChange: () => () => undefined,
      onMarqueeEnd: () => () => undefined,
      onEmptySpaceClick: () => () => undefined,
      getState: () => ({ selection: undefined }),
      clear: () => undefined,
    },
    /** Simulate EmbedPDF clearing text selection. */
    clearText: () => onSelectionChange?.(null),
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
