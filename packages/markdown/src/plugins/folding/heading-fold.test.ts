import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { EditorState } from "@codemirror/state";
import { cachedMarkdown, parseMarkdown } from "../../markdown/dialect";
import { headings } from "../../markdown/metadata/headings";
import {
  documentTree,
  parseForFirstPaint,
  replaceDocumentTree,
} from "../livePreview/api";
import { foldingChanged, foldRange } from "./webview";
import { headingFold } from "./heading-fold";

test("heading folds keep the metadata ranges for nested scopes and setext headings, multi-line ones too", () => {
  for (const doc of [
    "# One\n\nbody\n\n## Two\n\nbody\n\n# Three\n",
    "One\n===\n\nbody\n\nTwo\n---\n\nbody",
    "One line\nand another\n===\n\nbody\n\nTwo\nlines\nhere\n---\n\nbody",
    `${"A long heading line\n".repeat(100)}===\n\nbody\n\n# Next`,
    "> # One\n>\n> ## Two\n> body\n>\n> # Three\n> end\n\noutside",
    "- # One\n\n  body\n\n  ## Two\n\n  end\n- # Other\n  body",
    "# Outer\n\n> # Inner\n> body\n\n## Child\n\nbody\n\n# Next",
    "```md\n# Literal\n```\n\n# Last",
  ]) {
    const state = EditorState.create({ doc });
    const expected = headings(state.doc);
    for (let number = 1; number <= state.doc.lines; number++) {
      const line = state.doc.line(number);
      const heading = expected.find(
        (item) => item.from >= line.from && item.from <= line.to,
      );
      const range =
        heading && heading.end > heading.to
          ? { from: heading.to, to: heading.end }
          : null;
      assert.deepEqual(
        headingFold(state.doc, line.from, line.to),
        range,
        `${number}: ${doc}`,
      );
    }
  }
});

test("gutter fold queries visit only their lines and reuse results for an unchanged document", () => {
  const doc = Array.from({ length: 16000 }, (_, index) =>
    index % 8 === 0 ? `## Heading ${index}` : `Paragraph **${index}**.`,
  ).join("\n\n");
  const state = EditorState.create({ doc });
  const tree = parseMarkdown(state.doc);
  const iterate = tree.iterate.bind(tree);
  let visited = 0;
  const spy = mock.method(
    tree,
    "iterate",
    (options: Parameters<typeof tree.iterate>[0]) =>
      iterate({
        ...options,
        enter(node) {
          visited++;
          return options.enter(node);
        },
      }),
  );
  try {
    for (let number = 1; number <= 15; number++) {
      const line = state.doc.line(number);
      foldRange(state, line.from, line.to, { heading: true, indent: false });
    }
    assert.ok(visited < 100, `${visited} syntax nodes for 15 gutter lines`);
    const firstVisits = visited;
    for (let number = 1; number <= 15; number++) {
      const line = state.doc.line(number);
      foldRange(state, line.from, line.to, { heading: true, indent: false });
    }
    assert.equal(visited, firstVisits);
  } finally {
    spy.mock.restore();
  }
});

test("editing a distant heading invalidates the cached section boundary", () => {
  const state = EditorState.create({ doc: "# One\n\nbody\n\n## Two\n\nbody" });
  const line = state.doc.line(1);
  assert.equal(
    headingFold(state.doc, line.from, line.to)?.to,
    state.doc.length,
  );
  const next = state.update({
    changes: {
      from: state.doc.toString().indexOf("##"),
      to: state.doc.toString().indexOf("##") + 1,
    },
  }).state;
  assert.deepEqual(headingFold(next.doc, line.from, line.to), {
    from: line.to,
    to: next.doc.toString().indexOf("# Two") - 1,
  });
});

test("plain paragraph lines fast-reject in O(1) without touching the syntax tree and indent fold caches per Text", () => {
  const doc =
    "Plain paragraph line one.\n   indented child line\n\nAnother plain line.";
  const state = EditorState.create({ doc });
  const tree = parseMarkdown(state.doc);
  const iterate = tree.iterate.bind(tree);
  let visited = 0;
  const spy = mock.method(
    tree,
    "iterate",
    (options: Parameters<typeof tree.iterate>[0]) =>
      iterate({
        ...options,
        enter(node) {
          visited++;
          return options.enter(node);
        },
      }),
  );
  try {
    const line1 = state.doc.line(1);
    assert.equal(headingFold(state.doc, line1.from, line1.to, tree), null);
    assert.equal(visited, 0, "non-heading line does not iterate syntax tree");
    const first = foldRange(state, line1.from, line1.to, {
      heading: true,
      indent: true,
    });
    assert.deepEqual(first, { from: line1.to, to: state.doc.line(2).to });
    const second = foldRange(state, line1.from, line1.to, {
      heading: true,
      indent: true,
    });
    assert.equal(
      second,
      first,
      "foldRange reuses cached range for unchanged Text",
    );
  } finally {
    spy.mock.restore();
  }
});

/** A title over many sections: far longer than the first-paint parse. */
const longNote =
  "# Title\n\n" +
  Array.from(
    { length: 600 },
    (_, index) =>
      `## Section ${index}\n\n${"Words in a paragraph. ".repeat(12)}`,
  ).join("\n\n") +
  "\n";

test("headings fold from a prefix tree without parsing the whole note", () => {
  const state = EditorState.create({ doc: longNote });
  const prefix = parseForFirstPaint(state.doc);
  assert.ok(prefix.length < state.doc.length);
  const title = state.doc.line(1);
  const section = state.doc.line(3);
  const beyond = state.doc.lineAt(prefix.length + 1000);
  const next = longNote.indexOf("## Section 1\n");
  assert.deepEqual(headingFold(state.doc, section.from, section.to, prefix), {
    from: section.to,
    to: next - 1,
  });
  // The title's section runs past the prefix: it folds to the prefix's
  // last line until the rest is parsed.
  assert.deepEqual(headingFold(state.doc, title.from, title.to, prefix), {
    from: title.to,
    to: state.doc.lineAt(prefix.length - 1).to,
  });
  assert.equal(headingFold(state.doc, beyond.from, beyond.to, prefix), null);
  assert.equal(cachedMarkdown(state.doc), undefined, "no whole-note parse");
});

test("a fold found from a prefix is found again once the tree is complete", () => {
  let state = EditorState.create({ doc: longNote, extensions: [documentTree] });
  const options = { heading: true, indent: false };
  const title = state.doc.line(1);
  const prefix = state.field(documentTree);
  assert.ok(prefix.length < state.doc.length);
  assert.equal(
    foldRange(state, title.from, title.to, options)?.to,
    prefix.length - 1,
  );
  const startState = state;
  state = state.update({
    effects: replaceDocumentTree.of(parseMarkdown(state.doc)),
  }).state;
  assert.ok(foldingChanged({ startState, state }), "the gutter asks again");
  assert.equal(
    foldRange(state, title.from, title.to, options)?.to,
    state.doc.length,
  );
});
