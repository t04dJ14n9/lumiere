import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { documentTree } from "./document-tree";
import { inlineDecorations } from "./inline";

/** Each line's classes, and the source text hidden on it. */
function lines(doc: string, caret: number) {
  const state = EditorState.create({
    doc,
    selection: { anchor: caret },
    extensions: [documentTree],
  });
  const result = Array.from({ length: state.doc.lines }, () => ({
    classes: [] as string[],
    hidden: "",
  }));
  inlineDecorations(state, [{ from: 0, to: doc.length }]).between(
    0,
    doc.length,
    (from, to, value) => {
      const line = result[state.doc.lineAt(from).number - 1]!;
      if (value.spec.class && from === to) {
        line.classes.push(...String(value.spec.class).split(" "));
      } else if (from < to && !value.spec.class && !value.spec.widget) {
        line.hidden += state.sliceDoc(from, to);
      }
    },
  );
  return result;
}

const code = (classes: string[]) =>
  classes.filter((name) => name.startsWith("md-code"));

test("fenced code keeps the same line classes with the caret outside or inside; only the fence text hides", () => {
  for (const doc of [
    "Before\n\n```ts\nlet x = 1;\n```\n\nAfter",
    "Before\n\n~~~\nplain\n~~~\n\nAfter",
  ]) {
    const outside = lines(doc, 0);
    const inside = lines(doc, doc.indexOf("\n", 9) + 1);
    assert.deepEqual(
      outside.map((line) => code(line.classes)),
      inside.map((line) => code(line.classes)),
    );
    assert.deepEqual(code(outside[2]!.classes), [
      "md-code-line",
      "md-code-fence",
      "md-code-fence-open",
    ]);
    assert.deepEqual(code(outside[3]!.classes), ["md-code-line"]);
    assert.deepEqual(code(outside[4]!.classes), [
      "md-code-line",
      "md-code-fence",
      "md-code-fence-close",
    ]);
    assert.deepEqual(
      outside.map((line) => line.hidden),
      ["", "", doc.split("\n")[2], "", doc.split("\n")[4], "", ""],
    );
    assert.deepEqual(
      inside.map((line) => line.hidden),
      ["", "", "", "", "", "", ""],
    );
  }
});

test("an unclosed fence has no closing line and indented code is code lines", () => {
  const unclosed = lines("```js\nx\nstill code", 0);
  assert.deepEqual(
    unclosed.map((line) => code(line.classes)),
    [
      ["md-code-line", "md-code-fence", "md-code-fence-open"],
      ["md-code-line"],
      ["md-code-line"],
    ],
  );
  const indented = lines("Text\n\n    one\n    two\n\nAfter", 0);
  assert.deepEqual(
    indented.map((line) => code(line.classes)),
    [
      [],
      [],
      ["md-code-line", "md-code-indented"],
      ["md-code-line", "md-code-indented"],
      [],
      [],
    ],
  );
  assert.equal(indented.map((line) => line.hidden).join(""), "");
});
