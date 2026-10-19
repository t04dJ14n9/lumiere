import test from "node:test";
import assert from "node:assert/strict";
import {
  EditorSelection,
  EditorState,
  type Extension,
} from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import { documentTree } from "./document-tree";
import { inlineDecorations } from "./inline";

function stateFor(
  doc: string,
  selection: EditorSelection,
  extensions: Extension = [],
) {
  return EditorState.create({
    doc,
    selection,
    extensions: [
      documentTree,
      EditorState.allowMultipleSelections.of(true),
      extensions,
    ],
  });
}

function visibleSource(
  state: EditorState,
  decorations?: DecorationSet,
): string {
  const chars = state.doc.toString().split("");
  (
    decorations ?? inlineDecorations(state, [{ from: 0, to: state.doc.length }])
  ).between(0, state.doc.length, (from, to, value) => {
    if (value.point && from < to) {
      chars.fill("", from, to);
    }
  });
  return chars.join("");
}

// Obsidian 1.14.4: /workspace/plans/obsidian-reveal-rules.md, answers 1–4.
// Every caret offset checks both inclusive boundaries and the untouched neighbours.
const inlineCases = [
  {
    name: "per-element",
    gap: " ",
    parts: [
      ["**b**", "b"],
      ["*i*", "i"],
      ["~~s~~", "s"],
      ["==h==", "h"],
      ["`c`", "c"],
    ],
  },
  {
    name: "transitive chain",
    gap: "",
    parts: [
      ["**b**", "b"],
      ["~~s~~", "s"],
      ["==h==", "h"],
      ["`c`", "c"],
      ["_i_", "i"],
    ],
  },
  {
    name: "one character breaks chain",
    gap: "x",
    parts: [
      ["**b**", "b"],
      ["~~s~~", "s"],
      ["==h==", "h"],
    ],
  },
  {
    name: "one space breaks chain",
    gap: " ",
    parts: [
      ["**b**", "b"],
      ["~~s~~", "s"],
      ["==h==", "h"],
    ],
  },
  {
    name: "autolink endpoints and chain",
    gap: "",
    parts: [
      ["<https://x.test>", "https://x.test"],
      ["**b**", "b"],
    ],
  },
  {
    name: "outer bold reveals inner italic",
    gap: " ",
    parts: [
      ["**b _i_ b**", "b i b"],
      ["~~s~~", "s"],
    ],
  },
  {
    name: "outer link reveals inner bold",
    gap: " ",
    parts: [
      ["[t **b** t](u)", "t b t"],
      ["==h==", "h"],
    ],
  },
  {
    name: "outer highlight reveals inner code",
    gap: " ",
    parts: [
      ["==h `c` h==", "h c h"],
      ["*i*", "i"],
    ],
  },
  {
    name: "bold and highlight inside a word",
    gap: "x",
    parts: [
      ["**==bold==**", "bold"],
      ["==**bold**==", "bold"],
      ["*==italic==*", "italic"],
    ],
  },
  {
    name: "triple emphasis",
    gap: " ",
    parts: [
      ["***bi***", "bi"],
      ["`c`", "c"],
    ],
  },
  {
    name: "nested element extends through outer siblings",
    gap: "",
    parts: [
      ["**b _i_ b**", "b i b"],
      ["==h `c` h==", "h c h"],
    ],
  },
  {
    name: "reference link reveals per element",
    gap: " ",
    parts: [
      ["[txt][ref]", "txt"],
      ["**b**", "b"],
    ],
  },
  {
    name: "span HTML reveals per element",
    gap: " ",
    parts: [
      ["<span>sp</span>", "sp"],
      ["**b**", "b"],
    ],
  },
  {
    name: "HTML pair reveals nested Markdown",
    gap: " ",
    parts: [
      ["<b>x _i_ x</b>", "x i x"],
      ["~~s~~", "s"],
    ],
  },
  {
    name: "HTML pairs chain with Markdown",
    gap: "",
    parts: [
      ["<b>x</b>", "x"],
      ["<u>y</u>", "y"],
      ["**z**", "z"],
    ],
  },
] as const;

for (const { name, gap, parts } of inlineCases) {
  test(`Obsidian inline: ${name}`, () => {
    const doc = `aa ${parts.map(([raw]) => raw).join(gap)} zz`;
    let start = 3;
    const spans = parts.map(([raw, rendered]) => {
      const from = start;
      start += raw.length + gap.length;
      return { from, to: from + raw.length, raw, rendered };
    });
    let state = stateFor(doc, EditorSelection.single(0));
    for (let at = 0; at <= doc.length; at++) {
      state = state.update({ selection: EditorSelection.single(at) }).state;
      const expected = spans
        .map((span) => {
          const from = gap === "" ? 3 : span.from;
          const to = gap === "" ? doc.length - 3 : span.to;
          return at >= from && at <= to ? span.raw : span.rendered;
        })
        .join(gap);
      assert.equal(visibleSource(state), `aa ${expected} zz`, `caret ${at}`);
    }
  });
}

for (const [name, selection, expected] of [
  ["overlap", EditorSelection.single(5, 17), "aa **b1** bb **b2** cc b3"],
  ["gap", EditorSelection.single(10, 11), "aa b1 bb b2 cc b3"],
  [
    "multiple cursors",
    EditorSelection.create([
      EditorSelection.cursor(5),
      EditorSelection.cursor(23),
    ]),
    "aa **b1** bb b2 cc **b3**",
  ],
  [
    "multiple ranges touch chain ends",
    EditorSelection.create([
      EditorSelection.range(0, 3),
      EditorSelection.range(26, 29),
    ]),
    "aa **a**~~b~~ zz **c**==d== end",
  ],
] as const) {
  test(`Obsidian selection: ${name}`, () => {
    const doc =
      name === "multiple ranges touch chain ends"
        ? "aa **a**~~b~~ zz **c**==d== end"
        : "aa **b1** bb **b2** cc **b3**";
    assert.equal(visibleSource(stateFor(doc, selection)), expected);
  });
}

for (const [name, doc, at, expected] of [
  [
    "escapes on caret line",
    "aa \\* bb \\[ cc\nzz \\*",
    0,
    "aa \\* bb \\[ cc\nzz *",
  ],
  [
    "escapes on other line",
    "aa \\* bb \\[ cc\nzz \\*",
    17,
    "aa * bb [ cc\nzz \\*",
  ],
  ["quote per line", "> first\n> second\n> third", 3, "> first\nsecond\nthird"],
  [
    "heading leading whitespace",
    "  ## title **b**\nend",
    0,
    "  ## title b\nend",
  ],
  [
    "indented fence opening reveals pair",
    "before\n  ```js\nx\n  ```\nafter",
    7,
    "before\n  ```js\nx\n  ```\nafter",
  ],
  [
    "heading line and independent inline",
    "## title **b**\nend",
    5,
    "## title b\nend",
  ],
  [
    "hr leading whitespace",
    "before\n\n  ***  \n\nafter",
    8,
    "before\n\n  ***  \n\nafter",
  ],
  ["hr away", "before\n\n  ***  \n\nafter", 0, "before\n\n  \n\nafter"],
  [
    "fence pair from body",
    "before\n```js\nx\n```\nafter",
    13,
    "before\n```js\nx\n```\nafter",
  ],
  ["fences away", "before\n```js\nx\n```\nafter", 0, "before\n\nx\n\nafter"],
] as const) {
  test(`Obsidian line/block: ${name}`, () => {
    assert.equal(
      visibleSource(stateFor(doc, EditorSelection.single(at))),
      expected,
    );
  });
}

test("Obsidian quote lines follow overlapping selections and multiple cursors", () => {
  const doc = "> first\n> second\n> third";
  for (const [selection, expected] of [
    [EditorSelection.single(4, 12), "> first\n> second\nthird"],
    [
      EditorSelection.create([
        EditorSelection.cursor(3),
        EditorSelection.cursor(20),
      ]),
      "> first\nsecond\n> third",
    ],
  ] as const) {
    assert.equal(visibleSource(stateFor(doc, selection)), expected);
  }
});

test("Obsidian comments and list numbers keep their markers visible", () => {
  const doc = "1. text %%comment%% #tag\n\nafter";
  assert.equal(
    visibleSource(stateFor(doc, EditorSelection.single(doc.length))),
    doc,
  );
});

test("inline chains are recomputed after inserting or removing a gap", () => {
  let state = stateFor("aa **b**~~s~~ zz", EditorSelection.single(4));
  assert.equal(visibleSource(state), "aa **b**~~s~~ zz");
  state = state.update({ changes: { from: 8, insert: " " } }).state;
  assert.equal(visibleSource(state), "aa **b** s zz");
  state = state.update({ changes: { from: 8, to: 9 } }).state;
  assert.equal(visibleSource(state), "aa **b**~~s~~ zz");
});
