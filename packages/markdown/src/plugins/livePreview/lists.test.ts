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
    "--list-depth: 0; --list-marker: calc(1.25em + 3px)",
    "--list-depth: 1; --list-marker: calc(1.25em + 3px)",
    "--list-depth: 2; --list-marker: calc(1.25em + 3px)",
    "--list-depth: 0; --list-marker: calc(1.25em + 3px)",
    "--list-depth: 0; --list-marker: calc(1.5em + 6px)",
    "--list-depth: 1; --list-marker: calc(1.5em + 6px)",
  ]);
  assert.deepEqual(indents, [1, 2, 1]);
  assert.deepEqual(numbers, ["1. ", "1. "]);
});

test("marker widths cover bullets, numbers and task boxes", () => {
  // Where Obsidian starts the text: the same for every number's width.
  assert.equal(markerWidth("-", false), "calc(1.25em + 3px)");
  assert.equal(markerWidth("1.", false), "calc(1.5em + 6px)");
  assert.equal(markerWidth("10.", false), "calc(1.5em + 6px)");
  assert.equal(markerWidth("-", true), "calc(1.75em - 1px)");
});

test("list items inside quotes keep the quote layout", () => {
  assert.deepEqual(decorate("> - quoted item\n\nafter").lines, []);
});

test("an item's indented continuation lines hang under its text; a lazy line does not", () => {
  // As in Obsidian 1.14: `[[Home]]` starts under "An alias", and "four in"
  // further in; "lazy" stays at the margin.
  const doc =
    "- An alias:\n  [[Home]] here\n- Four:\n    four in\n1. Number\n   three in\n- Lazy:\nlazy\n- [ ] task\n      under task\n\nafter";
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [documentTree],
  });
  const continued: { line: string; hidden: string; style: string }[] = [];
  const hidden = new Map<number, string>();
  const decorations = inlineDecorations(state, [{ from: 0, to: doc.length }]);
  decorations.between(0, doc.length, (from, to, value) => {
    if (!value.spec.class && !value.spec.widget && from < to) {
      hidden.set(from, doc.slice(from, to));
    }
  });
  decorations.between(0, doc.length, (from, _to, value) => {
    if (value.spec.class === "md-list-line md-list-continuation") {
      continued.push({
        line: state.doc.lineAt(from).text,
        hidden: hidden.get(from) ?? "",
        style: value.spec.attributes.style,
      });
    }
  });
  assert.deepEqual(continued, [
    {
      line: "  [[Home]] here",
      hidden: "  ",
      style: "--list-depth: 0; --list-marker: calc(1.25em + 3px)",
    },
    {
      line: "    four in",
      hidden: "  ",
      style: "--list-depth: 0; --list-marker: calc(1.25em + 3px)",
    },
    {
      line: "   three in",
      hidden: "   ",
      style: "--list-depth: 0; --list-marker: calc(1.5em + 6px)",
    },
    {
      line: "      under task",
      hidden: "      ",
      style: "--list-depth: 0; --list-marker: calc(1.75em - 1px)",
    },
  ]);
});
