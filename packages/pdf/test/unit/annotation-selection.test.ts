import assert from "node:assert/strict";
import { test } from "node:test";
import {
  annotationDeleteTargets,
  annotationQuoteText,
  selectionFromAnnotation,
} from "../../src/shared/annotation-handoff";
import { agentText } from "../../src/shared/agent-text";

test("selectionFromAnnotation maps 0-based pageIndex and EmbedPDF rect to region selection", () => {
  const selection = selectionFromAnnotation({
    pageIndex: 2,
    rect: { origin: { x: 10, y: 20 }, size: { width: 30, height: 40 } },
    text: "hello",
  });
  assert.deepEqual(selection, {
    kind: "region",
    page: 3,
    rect: [10, 20, 40, 60],
    text: "hello",
  });
});

test("selectionFromAnnotation omits empty text for link-only handoff", () => {
  const selection = selectionFromAnnotation({
    pageIndex: 0,
    rect: { origin: { x: 0, y: 0 }, size: { width: 1, height: 1 } },
  });
  assert.deepEqual(selection, {
    kind: "region",
    page: 1,
    rect: [0, 0, 1, 1],
  });
  assert.equal(
    agentText(selection, { path: "papers/attention.pdf" }),
    "[attention.pdf · p.1](papers/attention.pdf#page=1&viewrect=0,0,1,1)",
  );
});

test("annotationQuoteText prefers page text, then contents, else undefined", () => {
  assert.equal(
    annotationQuoteText({ pageText: " from page ", contents: "note" }),
    "from page",
  );
  assert.equal(
    annotationQuoteText({ pageText: "  ", contents: " note body " }),
    "note body",
  );
  assert.equal(annotationQuoteText({ contents: "" }), undefined);
  assert.equal(annotationQuoteText({}), undefined);
});

test("annotationDeleteTargets collects pageIndex and id for deleteAnnotations", () => {
  assert.deepEqual(
    annotationDeleteTargets([
      { object: { pageIndex: 0, id: "a" } },
      { object: { pageIndex: 4, id: "b" } },
    ]),
    [
      { pageIndex: 0, id: "a" },
      { pageIndex: 4, id: "b" },
    ],
  );
  assert.deepEqual(annotationDeleteTargets([]), []);
});
