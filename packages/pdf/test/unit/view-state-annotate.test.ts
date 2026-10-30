import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseViewState,
  parseViewerAction,
} from "../../src/shared/view-state";
import { DEFAULT_VIEW_CHOICES } from "../../src/shared/view-settings";
import {
  ANNOTATION_TOOL_IDS,
  isAnnotationToolId,
} from "../../src/shared/annotation-tools";

const baseView = {
  page: 1,
  pageCount: 3,
  zoomPercent: 100,
  fit: null,
  tool: "annotate",
  canGoBack: false,
  canGoForward: true,
  readingPage: 1,
  zoom: 1,
  top: 0,
  left: 0,
  ...DEFAULT_VIEW_CHOICES,
};

test("parseViewState accepts annotate tool", () => {
  const view = parseViewState(baseView);
  assert.equal(view?.tool, "annotate");
});

test("parseViewerAction accepts setTool annotate and annotation tools", () => {
  assert.deepEqual(parseViewerAction({ action: "setTool", tool: "annotate" }), {
    action: "setTool",
    tool: "annotate",
  });
  assert.deepEqual(
    parseViewerAction({ action: "setAnnotationTool", tool: "ink" }),
    { action: "setAnnotationTool", tool: "ink" },
  );
  assert.deepEqual(parseViewerAction({ action: "annotationUndo" }), {
    action: "annotationUndo",
  });
  assert.deepEqual(parseViewerAction({ action: "annotationRedo" }), {
    action: "annotationRedo",
  });
  assert.equal(
    parseViewerAction({ action: "setAnnotationTool", tool: "link" }),
    undefined,
  );
});

test("ANNOTATION_TOOL_IDS covers the locked v1 toolkit", () => {
  for (const id of [
    "highlight",
    "underline",
    "strikeout",
    "squiggly",
    "textComment",
    "freeText",
    "ink",
    "square",
    "circle",
    "line",
    "lineArrow",
    "polygon",
    "polyline",
    "stamp",
  ] as const) {
    assert.ok(isAnnotationToolId(id));
    assert.ok(ANNOTATION_TOOL_IDS.includes(id));
  }
  assert.equal(isAnnotationToolId("link"), false);
  assert.equal(isAnnotationToolId("insertText"), false);
});
