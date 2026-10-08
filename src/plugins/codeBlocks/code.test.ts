import { EditorState } from "@codemirror/state";
import { fenceSelected } from "./code-source";
import test from "node:test";
import assert from "node:assert/strict";
import { codeOffset } from "./code-selection";
test("highlighted clicks map indentation and UTF-16 back to fenced and indented source", () => {
  assert.equal(
    codeOffset({
      source: "```js\n  🧠 x\n```",
      text: "🧠 x",
      row: 0,
      column: 3,
      fenced: true,
    }),
    11,
  );
  assert.equal(
    codeOffset({
      source: "    hello\n    world",
      text: "hello\nworld",
      row: 1,
      column: 2,
      fenced: false,
    }),
    16,
  );
  assert.equal(
    codeOffset({
      source: "```\none\n```",
      text: "wrong",
      row: 0,
      column: 1,
      fenced: true,
    }),
    undefined,
  );
  assert.equal(
    codeOffset({
      source: "```\none\n```",
      text: "one",
      row: 5,
      column: 0,
      fenced: true,
    }),
    undefined,
  );
});

test("editable fence selection includes final characters but excludes a following line start", () => {
  const doc = "```js\nx\n```\nafter";
  for (const [position, to, expected] of [
    [0, 11, true],
    [10, 11, true],
    [12, 12, false],
    [11, 11, true],
  ] as const) {
    const state = EditorState.create({ doc, selection: { anchor: position } });
    assert.equal(fenceSelected(state, { from: 0, to }), expected);
  }
});
