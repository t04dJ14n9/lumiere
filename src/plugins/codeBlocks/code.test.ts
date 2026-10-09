import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { fenceInfo, fenceRevealed } from "./fence-flair";
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

test("a fence shows its source exactly when Live Preview reveals it, final characters included", () => {
  const doc = "```js\nx\n```\nafter";
  for (const [position, expected] of [
    [0, true],
    [6, true],
    [11, true],
    [12, false],
  ] as const) {
    const state = EditorState.create({ doc, selection: { anchor: position } });
    assert.equal(fenceRevealed(state, { from: 0, to: 11 }), expected);
  }
});

test("fence info reads the language word and the code, with or without a language", () => {
  const info = (doc: string) => {
    const state = EditorState.create({ doc, extensions: [markdown()] });
    let found: ReturnType<typeof fenceInfo> | undefined;
    syntaxTree(state).iterate({
      enter: (node) => {
        if (node.name === "FencedCode") {
          found = fenceInfo(state, node);
        }
      },
    });
    return found;
  };
  assert.deepEqual(info("```python title\nprint(1)\n```"), {
    language: "python",
    code: "print(1)",
  });
  assert.deepEqual(info("~~~\nplain\n~~~"), {
    language: undefined,
    code: "plain",
  });
  assert.deepEqual(info("```ts\n```"), { language: "ts", code: "" });
});
