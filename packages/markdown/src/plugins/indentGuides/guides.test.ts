import test from "node:test";
import assert from "node:assert/strict";
import { EditorSelection, EditorState } from "@codemirror/state";
import { activeListGuideColumn, guideDecorations, indentation } from "./guides";

function widths(doc: string, isLivePreview: boolean, tabSize = 4) {
  const state = EditorState.create({
    doc,
    extensions: [EditorState.tabSize.of(tabSize)],
  });
  const result: Record<number, string> = {};
  guideDecorations(state, [{ from: 0, to: doc.length }], isLivePreview).between(
    0,
    doc.length,
    (from, _to, decoration) => {
      result[state.doc.lineAt(from).number] = decoration.spec.attributes.style;
    },
  );
  return result;
}

test("source indentation counts spaces and advances tabs to their next stop", () => {
  assert.equal(indentation("", 4), 0);
  assert.equal(indentation("plain text", 4), 0);
  assert.equal(indentation("   text", 4), 3);
  assert.equal(indentation(" \t text", 4), 5);
  assert.equal(indentation("\t\ttext", 4), 8);
  assert.equal(indentation("  \ttext", 2), 4);
});

test("live lists leave guide spacing to rendered nesting, not source columns", () => {
  const doc = [
    "1. Dockerfile and build context",
    "   - child",
    "     - [ ] task",
    "       task continuation",
    "   - sibling",
    "",
    "After",
  ].join("\n");
  assert.deepEqual(widths(doc, true), {});
  assert.deepEqual(widths(doc, false), {
    2: "--indent-width:3ch;--indent-step:4ch",
    3: "--indent-width:5ch;--indent-step:4ch",
    4: "--indent-width:7ch;--indent-step:4ch",
    5: "--indent-width:3ch;--indent-step:4ch",
  });
});

test("tabs, irregular list indentation and indented top-level markers use list layout", () => {
  for (const doc of [
    "- parent\n\t- child\n\t\t- grandchild",
    "- parent\n   - child\n      - grandchild",
    "  - parent\n    - child",
    "10. parent\n    1. child\n       - grandchild",
  ]) {
    assert.deepEqual(widths(doc, true), {}, doc);
    assert.notDeepEqual(widths(doc, false), {}, doc);
  }
});

test("non-list paragraphs and indented code keep source guides in live preview", () => {
  const doc = "  paragraph\n\n    indented code\n\n\tmore code";
  assert.deepEqual(widths(doc, true), widths(doc, false));
  assert.deepEqual(Object.keys(widths(doc, true)), ["1", "3", "5"]);
});

test("code blocks inside lists keep their own source indentation guides", () => {
  const doc = [
    "- parent",
    "  - child",
    "",
    "        indented code",
    "",
    "    ```text",
    "      fenced code",
    "    ```",
  ].join("\n");
  const source = widths(doc, false);
  assert.deepEqual(widths(doc, true), {
    4: source[4],
    6: source[6],
    7: source[7],
    8: source[8],
  });
});

test("quoted lists retain the quote layout and its existing source guides", () => {
  const doc = "  > - parent\n  >   - child";
  assert.deepEqual(widths(doc, true), widths(doc, false));
});

test("active list guide column follows nested Live Preview caret depth", () => {
  const doc = ["- parent", "  - child", "    - grand", "", "After"].join("\n");
  const at = (head: number) =>
    activeListGuideColumn(
      EditorState.create({
        doc,
        selection: EditorSelection.cursor(head),
      }),
    );
  assert.equal(at(0), undefined); // top-level: no guide column
  assert.equal(at(doc.indexOf("child")), 0);
  assert.equal(at(doc.indexOf("grand")), 1);
  assert.equal(at(doc.indexOf("After")), undefined);
});
