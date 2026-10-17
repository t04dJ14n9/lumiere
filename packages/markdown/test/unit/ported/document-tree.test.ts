import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, Text, type ChangeSpec } from "@codemirror/state";
import type { Tree } from "@lezer/common";
import { documentTree } from "../../../src/plugins/livePreview/document-tree";
import { headingIndex } from "../../../src/markdown/metadata/state";
import { headings } from "../../../src/markdown/metadata/headings";
import { markdownParser, parseMarkdown } from "../../../src/markdown/dialect";
import { footnotes } from "../../../src/markdown/metadata/footnotes";

function nodes(tree: Tree): [string, number, number][] {
  const result: [string, number, number][] = [];
  tree.iterate({
    enter: (node) => {
      result.push([node.name, node.from, node.to]);
    },
  });
  return result;
}
function check(state: EditorState, step: string): void {
  const source = state.doc.toString();
  assert.deepEqual(
    nodes(state.field(documentTree)),
    nodes(markdownParser.parse(source)),
    step,
  );
  assert.deepEqual(
    state.field(headingIndex),
    headings(source),
    step + " headings",
  );
  assert.deepEqual(
    footnotes(state.doc),
    footnotes(Text.of(source.split("\n"))),
    step + " footnotes",
  );
}

const sections = Array.from(
  { length: 40 },
  (_, i) =>
    `## Section ${i}\n\nA **paragraph** with 中文 🧠, [link](#target), note[^${i}] and ^[inline].\n\n` +
    `| A | B |\n| --- | --- |\n| ${i} | value |\n\n[^${i}]: Evidence\n    with continuation\n\n`,
).join("");

test("complete syntax is shared by outline and footnote indexes and retained for selections", () => {
  const state = EditorState.create({
    doc: sections,
    extensions: [documentTree, headingIndex],
  });
  assert.strictEqual(parseMarkdown(state.doc), state.field(documentTree));
  assert.equal(state.field(headingIndex).length, 40);
  assert.equal(footnotes(state.doc).definitions.length, 40);
  const moved = state.update({ selection: { anchor: state.doc.length } }).state;
  assert.strictEqual(moved.field(documentTree), state.field(documentTree));
  assert.strictEqual(moved.field(headingIndex), state.field(headingIndex));
});

test("incremental syntax reparses fences, frontmatter and math boundaries beyond the edit", () => {
  let state = EditorState.create({
    doc: "---\ntitle: Note\n---\n\n" + sections,
    extensions: [documentTree, headingIndex],
  });
  const apply = (changes: ChangeSpec, label: string) => {
    state = state.update({ changes }).state;
    check(state, label);
  };
  apply(
    { from: 0, insert: "Intro\n\n" },
    "frontmatter moved away from the first line",
  );
  apply({ from: 0, to: 7 }, "frontmatter restored to the first line");
  const body = state.doc.toString().indexOf("## Section 0");
  apply(
    { from: body, insert: "```md\n" },
    "an opening fence excludes all later headings and notes",
  );
  apply(
    { from: state.doc.length, insert: "\n```\n# After fence\n" },
    "closing fence",
  );
  apply({ from: body, to: body + 6 }, "remove opening fence");
  apply({ from: body, insert: "$$\n" }, "math opening");
  apply({ from: body, to: body + 3 }, "math opening removed");
  apply(
    [
      { from: body, insert: "> " },
      { from: state.doc.length, insert: "\nEnd 中文\n" },
    ],
    "multiple changed ranges",
  );
});

test("incremental syntax and indexes match fresh parses through deterministic structural edits", () => {
  let state = EditorState.create({
    doc: sections,
    extensions: [documentTree, headingIndex],
  });
  let seed = 271828;
  const random = (limit: number): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  const inserted = [
    "x",
    "\n",
    "\n## New\n",
    "```\n",
    "$$\n",
    "---\n",
    "> ",
    "[^new]: Note\n",
    "^[inline]",
    "|",
    "中文 🧠",
    "",
  ];
  for (let step = 0; step < 240; step++) {
    const from = random(state.doc.length + 1);
    const to = Math.min(state.doc.length, from + random(12));
    state = state.update({
      changes: { from, to, insert: inserted[random(inserted.length)]! },
    }).state;
    check(state, `step ${step}`);
  }
});
