import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { documentTree } from "./document-tree";
import { inlineDecorations } from "./inline";

function decorate(doc: string, anchor: number) {
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [documentTree],
  });
  const marks: string[] = [];
  const hidden: string[] = [];
  inlineDecorations(state, [{ from: 0, to: doc.length }]).between(
    0,
    doc.length,
    (from, to, value) => {
      const cls = String(value.spec.class ?? "");
      if (cls.startsWith("md-html")) {
        marks.push(`${cls}:${doc.slice(from, to)}`);
      }
      if (!value.spec.class && !value.spec.widget && value.point) {
        hidden.push(doc.slice(from, to));
      }
    },
  );
  return { marks, hidden };
}

const doc =
  "Press <kbd>Ctrl</kbd> and <u>under</u>, not <div>block</div>.\n\nend";

test("kbd and u pairs draw their content styled and hide the tags off the caret", () => {
  const { marks, hidden } = decorate(doc, doc.length);
  assert.deepEqual(marks, [
    "md-html md-html-kbd:Ctrl",
    "md-html md-html-u:under",
  ]);
  assert.deepEqual(hidden, ["<kbd>", "</kbd>", "<u>", "</u>"]);
});

test("the caret inside a pair reveals its tags", () => {
  const { hidden } = decorate(doc, doc.indexOf("Ctrl") + 1);
  assert.deepEqual(hidden, ["<u>", "</u>"]);
});
