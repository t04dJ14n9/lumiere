import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { markdownLanguageSupport } from "../../markdown/dialect";
import { unresolvedLinks } from "./api";
import { unresolvedSourceMarks } from "./source-unresolved";

function marks(doc: string, unresolved: string[]) {
  const state = EditorState.create({
    doc,
    extensions: [
      markdownLanguageSupport(),
      unresolvedLinks.init(() => new Set(unresolved.map((s) => s.toLowerCase()))),
    ],
  });
  return unresolvedSourceMarks(state, 0, doc.length);
}

test("source marks unresolved wiki, embed, and Markdown links", () => {
  const doc =
    "See [[Missing]] and ![[Gone]] plus [label](Absent.md) and [ok](https://x.test).\n";
  const found = marks(doc, ["missing", "gone", "absent"]);
  assert.deepEqual(
    found.map((m) => doc.slice(m.from, m.to)),
    ["[[Missing]]", "![[Gone]]", "[label](Absent.md)"],
  );
});

test("resolved and external links are not marked", () => {
  const doc = "[[Here]] [site](https://example.com) [local](Here.md)\n";
  assert.deepEqual(marks(doc, ["missing"]), []);
});
