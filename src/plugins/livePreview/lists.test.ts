import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { documentTree } from "./document-tree";
import { inlineDecorations } from "./inline";
import { markerWidth } from "./lists";

function decorate(doc: string) {
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [documentTree],
  });
  const lines: string[] = [];
  const indents: number[] = [];
  const numbers: string[] = [];
  inlineDecorations(state, [{ from: 0, to: doc.length }]).between(
    0,
    doc.length,
    (from, to, value) => {
      if (value.spec.class === "md-list-line") {
        lines.push(value.spec.attributes.style);
      }
      if (value.spec.widget?.constructor.name === "ListIndent") {
        indents.push(value.spec.widget.depth);
        assert.match(doc.slice(from, to), /^\s+$/);
      }
      if (value.spec.class === "md-list-number") {
        numbers.push(doc.slice(from, to));
      }
    },
  );
  return { lines, indents, numbers };
}

test("nested list items get one indent step per level and a hanging marker", () => {
  const doc =
    "- one\n  - two\n    - three\n- four\n\n1. first\n   1. inner\n\nafter";
  const { lines, indents, numbers } = decorate(doc);
  assert.deepEqual(lines, [
    "--list-depth: 0; --list-marker: 1.1em",
    "--list-depth: 1; --list-marker: 1.1em",
    "--list-depth: 2; --list-marker: 1.1em",
    "--list-depth: 0; --list-marker: 1.1em",
    "--list-depth: 0; --list-marker: 3ch",
    "--list-depth: 1; --list-marker: 3ch",
  ]);
  assert.deepEqual(indents, [1, 2, 1]);
  assert.deepEqual(numbers, ["1. ", "1. "]);
});

test("marker widths cover bullets, numbers and task boxes", () => {
  assert.equal(markerWidth("-", false), "1.1em");
  assert.equal(markerWidth("10.", false), "4ch");
  assert.equal(markerWidth("-", true), "calc(21px + 0.3em)");
});

test("list items inside quotes keep the quote layout", () => {
  assert.deepEqual(decorate("> - quoted item\n\nafter").lines, []);
});
