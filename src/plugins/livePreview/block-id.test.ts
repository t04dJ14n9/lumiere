import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { documentTree } from "./document-tree";
import { inlineDecorations } from "./inline";

function blockIds(doc: string): string[] {
  const state = EditorState.create({ doc, extensions: [documentTree] });
  const found: string[] = [];
  inlineDecorations(state, [{ from: 0, to: doc.length }]).between(
    0,
    doc.length,
    (from, to, value) => {
      if (value.spec.class === "md-block-id") {
        found.push(doc.slice(from, to));
      }
    },
  );
  return found;
}

test("a block identifier ending a paragraph or list item is faint", () => {
  const doc =
    "Some text. ^key-point\n\n- An item ^list-item\n\nNot an id^here\n\nWrap\nnext ^two";
  assert.deepEqual(blockIds(doc), ["^key-point", "^list-item", "^two"]);
});
