import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, Text } from "@codemirror/state";
import { headingIndex, sectionHeadings, stickyHeadings } from "./model";

function document(text: string) {
  const doc = Text.of(text.split("\n"));
  const headings = sectionHeadings(doc);
  return {
    doc,
    headings,
    at: (text: string, limit = 6) =>
      stickyHeadings(headings, doc.toString().indexOf(text), limit).map(
        (heading) => heading.label,
      ),
  };
}

test("keeps ancestors, replaces siblings and resets at the next root heading", () => {
  const f = document(
    "intro\n# Root\nroot body\n### Skipped\nchild body\n## Sibling\nsibling body\n# Next\nnext body",
  );
  assert.deepEqual(f.at("intro"), []);
  assert.deepEqual(f.at("# Root"), []);
  assert.deepEqual(f.at("root body"), ["Root"]);
  assert.deepEqual(f.at("### Skipped"), ["Root"]);
  assert.deepEqual(f.at("child body"), ["Root", "Skipped"]);
  assert.deepEqual(f.at("## Sibling"), ["Root"]);
  assert.deepEqual(f.at("sibling body"), ["Root", "Sibling"]);
  assert.deepEqual(f.at("# Next"), []);
  assert.deepEqual(f.at("next body"), ["Next"]);
});

test("recognizes Setext and formatted labels while ignoring non-section headings", () => {
  const f = document(
    '---\ntitle: "# YAML"\n---\n# **Root** [link](https://example.com)\n\n```md\n# Code\n```\n\n> # Quoted\n> quote body\n\n- ## Listed\n  list body\n\nSub `code`\n----------\n\nend',
  );
  assert.deepEqual(
    f.headings.map((heading) => heading.label),
    ["Root link", "Sub code"],
  );
  assert.deepEqual(f.at("end"), ["Root link", "Sub code"]);
  const underline = f.doc.toString().indexOf("----------");
  assert.deepEqual(
    stickyHeadings(f.headings, underline, 6).map((heading) => heading.label),
    ["Root link"],
  );
});

test("caps rows to the nearest ancestors and rounds the row budget down", () => {
  const f = document("# A\n## B\n### C\n#### D\n##### E\n###### F\nbody");
  assert.deepEqual(f.at("body", 3), ["D", "E", "F"]);
  assert.deepEqual(f.at("body", 1.9), ["F"]);
  assert.deepEqual(f.at("body", 0), []);
  assert.deepEqual(f.at("body", -1), []);
  assert.deepEqual(f.at("body", 6), ["A", "B", "C", "D", "E", "F"]);
});

test("handles duplicate, empty and indented headings without confusing their ranges", () => {
  const f = document("  # Same\nfirst\n##\nempty body\n# Same\nsecond");
  assert.deepEqual(f.at("empty body"), ["Same", ""]);
  assert.deepEqual(f.at("second"), ["Same"]);
  assert.notEqual(f.headings[0]?.key, f.headings[2]?.key);
  assert.deepEqual(stickyHeadings([], 100, 5), []);
  assert.deepEqual(
    document("# ###\nbody").headings.map((heading) => heading.label),
    [""],
  );
});

test("indexes the full document and updates on edits, while selection preserves the index", () => {
  const doc = "# Root\n" + "paragraph\n".repeat(3000) + "## Distant\nbody";
  let state = EditorState.create({ doc, extensions: headingIndex });
  const first = state.field(headingIndex);
  assert.equal(first.length, 2);
  state = state.update({ selection: { anchor: 2 } }).state;
  assert.equal(state.field(headingIndex), first);
  state = state.update({
    changes: { from: 2, to: 6, insert: "Renamed" },
  }).state;
  const changed = state.field(headingIndex);
  assert.equal(changed[0]?.label, "Renamed");
  assert.equal(changed[1]?.from, first[1]!.from + 3);
  state = state.update({
    changes: { from: 0, to: state.doc.length, insert: "plain" },
  }).state;
  assert.deepEqual(state.field(headingIndex), []);
});
