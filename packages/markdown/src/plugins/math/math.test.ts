import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { mathBody, mathTokens } from "./source";
import { inlineMathEdit, mathBlockEdit } from "./commands";
test("math commands preserve selected formulas and unwrap the same source", () => {
  let state = EditorState.create({
    doc: "x + 🧠",
    selection: { anchor: 0, head: 6 },
  });
  state = state.update(inlineMathEdit(state)).state;
  assert.equal(state.doc.toString(), "$x + 🧠$");
  state = state.update(inlineMathEdit(state)).state;
  assert.equal(state.doc.toString(), "x + 🧠");
  state = state.update(mathBlockEdit(state)).state;
  assert.equal(state.doc.toString(), "$$\nx + 🧠\n$$");
});

test("Insert Math Block puts $$ lines around the selected lines, as in Obsidian", () => {
  for (const [doc, anchor, head, expected] of [
    ["abc", 1, 1, "$$\na|bc\n$$"],
    ["above\n\nbelow", 6, 6, "above\n$$\n|\n$$\nbelow"],
    ["above\none\ntwo\nbelow", 6, 13, "above\n$$\n‹one\ntwo›\n$$\nbelow"],
    ["", 0, 0, "$$\n|\n$$"],
  ] as const) {
    const state = EditorState.create({ doc, selection: { anchor, head } });
    const result = state.update(mathBlockEdit(state)).state;
    const { from, to } = result.selection.main;
    const text = result.doc.toString();
    const shown =
      from === to
        ? `${text.slice(0, from)}|${text.slice(from)}`
        : `${text.slice(0, from)}‹${text.slice(from, to)}›${text.slice(to)}`;
    assert.equal(shown, expected);
  }
});

test("a click selects the formula without its delimiters or the line breaks next to them", () => {
  const body = (source: string) => {
    const span = mathBody(source);
    return source.slice(span.from, span.to);
  };
  assert.equal(body("$$\n\\frac{a}{b}\n$$"), "\\frac{a}{b}");
  assert.equal(body("$$\na = b\n\\\\\nc = d\n$$"), "a = b\n\\\\\nc = d");
  assert.equal(body("$$x$$"), "x");
  assert.equal(body("$x^2 + y$"), "x^2 + y");
  // Unclosed at the end of the note: the rest is the formula.
  assert.equal(body("$$\nx"), "x");
  assert.deepEqual(mathBody("$$\n$$"), { from: 3, to: 3 });
});

test("TeX is highlighted as Obsidian colours it: commands, numbers, letters, brackets", () => {
  const parts = (text: string) =>
    mathTokens(text).map(
      ({ from, to, type }) => `${type}:${text.slice(from, to)}`,
    );
  assert.deepEqual(parts("\\frac{a}{b}"), [
    "command:\\frac",
    "bracket:{",
    "variable:a",
    "bracket:}",
    "bracket:{",
    "variable:b",
    "bracket:}",
  ]);
  assert.deepEqual(parts("x^2 + y_{10}"), [
    "variable:x",
    "command:^",
    "number:2",
    "variable:y",
    "command:_",
    "bracket:{",
    "number:10",
    "bracket:}",
  ]);
  assert.deepEqual(parts("a \\\\ b"), [
    "variable:a",
    "command:\\\\",
    "variable:b",
  ]);
});
