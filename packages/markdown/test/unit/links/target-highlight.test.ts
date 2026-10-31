import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { foldEffect, foldState } from "@codemirror/language";
import {
  flashingHighlights,
  resolveNavigationTarget,
  setFlashing,
  unfoldTargetEffects,
} from "../../../src/plugins/links/target-highlight";

test("resolveNavigationTarget returns selectTo for a search match span [at, to]", () => {
  const doc = "# Overview\n\nFirst paragraph with matched-token inside.\n";
  const state = EditorState.create({ doc });
  const at = doc.indexOf("matched-token");
  const to = at + "matched-token".length;
  const target = resolveNavigationTarget(state, "", at, to);
  assert.deepEqual(target, {
    from: at,
    to,
    selectTo: to,
  });
});

test("resolveNavigationTarget highlights the line without selectTo when to is omitted", () => {
  const doc = "# Overview\n\nSecond line content\nThird line";
  const state = EditorState.create({ doc });
  const at = doc.indexOf("content");
  const line = state.doc.lineAt(at);
  const target = resolveNavigationTarget(state, "", at);
  assert.deepEqual(target, {
    from: at,
    to: line.to,
  });
});

test("resolveNavigationTarget resolves heading and block-id fragments", () => {
  const doc = "# Intro\n\n## Target Heading\n\nParagraph text ^block-ref\n";
  const state = EditorState.create({ doc });
  const headingAt = doc.indexOf("## Target Heading");
  const headingLine = state.doc.lineAt(headingAt);
  assert.deepEqual(resolveNavigationTarget(state, "Target Heading"), {
    from: headingLine.from,
    to: headingLine.to,
  });

  const blockTarget = resolveNavigationTarget(state, "^block-ref");
  assert.ok(blockTarget);
  assert.equal(blockTarget.from, doc.indexOf("Paragraph text"));
  assert.equal(blockTarget.selectTo, undefined);
});

test("unfoldTargetEffects unfolds any folded section covering the target span", () => {
  const doc = "# Section\nFolded body with search-match inside\n# Next";
  const foldFrom = doc.indexOf("\nFolded");
  const foldTo = doc.indexOf("\n# Next");
  let state = EditorState.create({
    doc,
    extensions: [foldState],
  });
  state = state.update({
    effects: foldEffect.of({ from: foldFrom, to: foldTo }),
  }).state;

  const matchStart = doc.indexOf("search-match");
  const matchEnd = matchStart + "search-match".length;
  const effects = unfoldTargetEffects(state, matchStart, matchEnd);
  assert.equal(effects.length, 1);
});

test("flashingHighlights tracks and clears the .is-flashing decoration range", () => {
  const doc = "Alpha beta gamma";
  let state = EditorState.create({
    doc,
    extensions: [flashingHighlights()],
  });
  state = state.update({
    effects: setFlashing.of({ from: 6, to: 10 }),
  }).state;
  state = state.update({
    effects: setFlashing.of(null),
  }).state;
  assert.equal(state.doc.toString(), doc);
});

test("resolveNavigationTarget selects full lines for #L Cursor-style fragments", () => {
  const doc = "# Title\nline two content\nline three\nline four end\n";
  const state = EditorState.create({ doc });
  const line2 = state.doc.line(2);
  const line3 = state.doc.line(3);
  assert.deepEqual(resolveNavigationTarget(state, "L2"), {
    from: line2.from,
    to: line2.to,
    selectTo: line2.to,
  });
  assert.deepEqual(resolveNavigationTarget(state, "L2-L3"), {
    from: line2.from,
    to: line3.to,
    selectTo: line3.to,
  });
  assert.deepEqual(resolveNavigationTarget(state, "L19-L19"), undefined);
  // Bare digits are not forced line selection in-Lumière (may be headingId).
  assert.equal(resolveNavigationTarget(state, "3"), undefined);
});

test("resolveNavigationTarget prefers noteFragment for bare digit heading slugs", () => {
  const doc = "# Title\nline two\n## 3\nbody under three\n";
  const state = EditorState.create({ doc });
  const headingAt = doc.indexOf("## 3");
  const headingLine = state.doc.lineAt(headingAt);
  assert.deepEqual(resolveNavigationTarget(state, "3"), {
    from: headingLine.from,
    to: headingLine.to,
  });
  // L-prefixed still wins over a same-number heading.
  const line2 = state.doc.line(2);
  assert.deepEqual(resolveNavigationTarget(state, "L2"), {
    from: line2.from,
    to: line2.to,
    selectTo: line2.to,
  });
});
