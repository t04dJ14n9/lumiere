import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import { completeFence, wrapOnly } from "./markdown-input";

/** Types `text` at `|` (or over `‹…›`) and shows the result, or "default". */
function type(
  doc: string,
  text: string,
  handle: (state: EditorState, text: string) => TransactionSpec | undefined,
): string {
  const anchor = doc.includes("‹") ? doc.indexOf("‹") : doc.indexOf("|");
  const head = doc.includes("›") ? doc.indexOf("›") - 1 : anchor;
  const state = EditorState.create({
    doc: doc.replace(/[|‹›]/gu, ""),
    selection: { anchor, head },
  });
  const spec = handle(state, text);
  if (!spec) {
    return "default";
  }
  const next = state.update(spec).state;
  const { from, to } = next.selection.main;
  const out = next.doc.toString();
  return from === to
    ? out.slice(0, from) + "|" + out.slice(from)
    : out.slice(0, from) + "‹" + out.slice(from, to) + "›" + out.slice(to);
}

test("= ~ $ % wrap a selection, as in Obsidian, and type alone without one", () => {
  for (const char of ["=", "~", "$", "%"]) {
    assert.equal(
      type("a ‹word› b", char, wrapOnly),
      `a ${char}‹word›${char} b`,
    );
    assert.equal(type("a |", char, wrapOnly), "default");
  }
  assert.equal(type("a ‹word› b", "^", wrapOnly), "default");
});

test("the third backtick closes the fence on the next line", () => {
  assert.equal(type("``|", "`", completeFence), "```|\n```");
  assert.equal(type("``|abc", "`", completeFence), "```|\n```abc");
  assert.equal(type("x ``|", "`", completeFence), "x ```|\n```");
  assert.equal(type("> ``|", "`", completeFence), "> ```|\n> ```");
  assert.equal(type("\t``|", "`", completeFence), "\t```|\n\t```");
  assert.equal(type("- ``|", "`", completeFence), "- ```|\n  ```");
});

test("a fourth backtick is typed as it is; the first two pair as usual", () => {
  assert.equal(type("```|\n```", "`", completeFence), "````|\n```");
  assert.equal(type("`|", "`", completeFence), "default");
  assert.equal(type("|", "`", completeFence), "default");
});
