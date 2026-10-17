import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { mathBody, mathTokens } from "./source";
import { mathEdit } from "./commands";
test("math commands preserve selected formulas and unwrap the same source", () => {
  let state = EditorState.create({
    doc: "x + 🧠",
    selection: { anchor: 0, head: 6 },
  });
  state = state.update(mathEdit(state, false)).state;
  assert.equal(state.doc.toString(), "$x + 🧠$");
  state = state.update(mathEdit(state, false)).state;
  assert.equal(state.doc.toString(), "x + 🧠");
  state = state.update(mathEdit(state, true)).state;
  assert.equal(state.doc.toString(), "$$\nx + 🧠\n$$\n");
});

test("display math inserts a leading newline only inside an existing line", () => {
  for (const [doc, from, expected] of [
    ["abc", 1, "a\n$$\n\n$$\nbc"],
    ["a\nb", 2, "a\n$$\n\n$$\nb"],
    ["", 0, "$$\n\n$$\n"],
  ] as const) {
    const state = EditorState.create({ doc, selection: { anchor: from } });
    const result = state.update(mathEdit(state, true)).state;
    assert.equal(result.doc.toString(), expected);
    assert.equal(
      result.sliceDoc(result.selection.main.from, result.selection.main.to),
      "",
    );
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
