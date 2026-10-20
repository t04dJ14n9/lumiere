import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EditorState } from "@codemirror/state";
import { mathBody, mathTokens } from "./source";
import { inlineMathEdit, mathBlockEdit } from "./commands";

/** The declarations of a rule in `file`, by its exact selector. */
function cssRule(file: URL, selector: string): string {
  const css = readFileSync(file, "utf8");
  const start = css.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `${selector} is styled`);
  return css.slice(start, css.indexOf("}", start));
}
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

test("a formula on a list item's first line does not inherit the item's hanging indent", () => {
  // List lines hang their wrapped text with a negative text-indent, which an
  // inline-block inherits: the formula would shift over the marker and a
  // narrow one would shrink to nothing.
  const listLine = cssRule(
    new URL("../../webview/styles/markdown.css", import.meta.url),
    "#app .cm-line.md-list-line",
  );
  assert.match(listLine, /text-indent:\s*calc\(-1 \* var\(--list-hang\)\)/);
  const formula = cssRule(
    new URL("./math.css", import.meta.url),
    ".math-placeholder",
  );
  assert.match(formula, /display:\s*inline-block/);
  assert.match(formula, /text-indent:\s*0;/);
});

test("inline math CSS keeps the CM line from growing past Obsidian", () => {
  const placeholder = cssRule(
    new URL("./math.css", import.meta.url),
    ".math-placeholder",
  );
  assert.match(placeholder, /vertical-align:\s*middle/);
  assert.match(placeholder, /line-height:\s*0/);
  const css = readFileSync(new URL("./math.css", import.meta.url), "utf8");
  assert.match(
    css,
    /\.math-placeholder:not\(\.math-display\)\s+mjx-container\s+svg\s*\{[^}]*overflow:\s*hidden/s,
  );
  assert.match(
    css,
    /\.math-display\s+mjx-container\s+svg\s*\{[^}]*overflow:\s*visible/s,
  );
  assert.doesNotMatch(
    css.replace(/\.math-display\s+mjx-container\s+svg\s*\{[^}]*\}/s, ""),
    /mjx-container\s+svg\s*\{[^}]*overflow:\s*visible/s,
  );
});
