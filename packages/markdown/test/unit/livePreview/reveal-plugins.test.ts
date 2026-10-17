import test from "node:test";
import assert from "node:assert/strict";
import {
  EditorSelection,
  EditorState,
  type Extension,
} from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import { documentTree } from "../../../src/plugins/livePreview/document-tree";
import { inlineDecorations } from "../../../src/plugins/livePreview/inline";
import {
  blockDecorations,
  blockIndex,
} from "../../../src/plugins/livePreview/blocks";
import {
  blockRenderers,
  inlineRenderers,
} from "../../../src/plugins/livePreview/registry";
import { wikiLinkRenderer } from "../../../src/plugins/links/webview";
import { inlineTasks } from "../../../src/plugins/tasks/webview";
import { footnoteInline } from "../../../src/plugins/footnotes/inline";
import { mathWebview } from "../../../src/plugins/math/webview";
import { embedsWebview } from "../../../src/plugins/embeds/webview";
import { calloutsWebview } from "../../../src/plugins/callouts/webview";
import { tagsWebview } from "../../../src/plugins/tags/webview";
import type { RenderService } from "../../../src/plugins/render/api";
import { fixture } from "../features/fixture";

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
      inlineRenderers.of(wikiLinkRenderer),
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
for (const at of [0, 1, 2, 3, 4, 5, 6, 9]) {
  test(`Obsidian task: column ${at}`, () => {
    const doc = "- [ ] task";
    const state = stateFor(
      doc,
      EditorSelection.single(at),
      inlineRenderers.of(inlineTasks),
    );
    assert.equal(visibleSource(state), at <= 5 ? doc : " task");
  });
}

for (const [name, at, raw] of [
  ["first line body", 14, true],
  ["first line end", 19, true],
  ["continuation", 25, false],
  ["outside", 40, false],
] as const) {
  test(`Obsidian footnote definition: ${name}`, () => {
    const doc = "[^1]: text **b** xx\n    continued\n\nafter";
    const state = stateFor(
      doc,
      EditorSelection.single(Math.min(at, doc.length)),
      inlineRenderers.of(footnoteInline({} as RenderService)),
    );
    assert.equal(visibleSource(state).startsWith("[^1]:"), raw);
  });
}

test("Obsidian wikilinks join a chain of links and emphasis", () => {
  const doc = "aa [a](x.md)[[B]]**c** zz";
  for (let at = 0; at <= doc.length; at++) {
    const state = stateFor(doc, EditorSelection.single(at));
    assert.equal(
      visibleSource(state),
      at >= 3 && at <= doc.length - 3 ? doc : "aa aBc zz",
    );
  }
});

test("Obsidian math and embeds use the shared inline reveal rules", async () => {
  const f = fixture();
  try {
    f.root.plugin(mathWebview);
    f.root.plugin(embedsWebview);
    await f.root.settled();
    const renderers = f.view.state
      .facet(inlineRenderers)
      .map((r) => inlineRenderers.of(r));
    for (const raw of ["$x$", "$$x$$", "![[note]]", "![alt](image.png)"]) {
      for (const gap of ["", " ", "x"]) {
        const doc = `aa **b**${gap}${raw} zz`;
        for (let at = 0; at <= doc.length; at++) {
          const state = stateFor(doc, EditorSelection.single(at), renderers);
          const from = gap === "" ? 3 : 8 + gap.length;
          const isRevealed = at >= from && at <= doc.length - 3;
          const bold = at >= 3 && at <= (gap === "" ? doc.length - 3 : 8);
          assert.equal(
            visibleSource(state),
            `aa ${bold ? "**b**" : "b"}${gap}${isRevealed ? raw : ""} zz`,
            `${raw}, gap '${gap}', caret ${at}`,
          );
        }
      }
      const nested = `aa **b ${raw} b** zz`;
      assert.equal(
        visibleSource(stateFor(nested, EditorSelection.single(3), renderers)),
        nested,
      );
    }
  } finally {
    await f.root.dispose();
  }
});

test("Obsidian callout reveals its block, only selected quote lines, and independent inline elements", async () => {
  const f = fixture();
  try {
    f.root.plugin(calloutsWebview);
    await f.root.settled();
    const blocks = blockDecorations((error) => {
      throw error;
    });
    const doc = "> [!note] Title\n> **bold** and *italic*\n> tail\n\nafter";
    const create = (at: number) =>
      stateFor(doc, EditorSelection.single(at), [
        blockIndex,
        blocks,
        f.view.state.facet(blockRenderers).map((r) => blockRenderers.of(r)),
      ]);
    let state = create(doc.length);
    assert.equal(visibleSource(state, state.field(blocks)), "\n\nafter");
    for (const [at, expected] of [
      [doc.indexOf("Title"), "> [!note] Title\nbold and italic\ntail\n\nafter"],
      [
        doc.indexOf("bold"),
        "[!note] Title\n> **bold** and italic\ntail\n\nafter",
      ],
      [doc.indexOf("tail"), "[!note] Title\nbold and italic\n> tail\n\nafter"],
    ] as const) {
      state = state.update({ selection: EditorSelection.single(at) }).state;
      assert.equal(visibleSource(state, state.field(blocks)), doc);
      assert.equal(visibleSource(state), expected);
    }
  } finally {
    await f.root.dispose();
  }
});

test("Obsidian display math reveals whole source and keeps its editing preview", async () => {
  const f = fixture();
  try {
    f.root.plugin(mathWebview);
    await f.root.settled();
    const blocks = blockDecorations((error) => {
      throw error;
    });
    const doc = "before\n\n$$\nx + y\n$$\n\nafter";
    let state = stateFor(doc, EditorSelection.single(0), [
      blockIndex,
      blocks,
      f.view.state.facet(blockRenderers).map((r) => blockRenderers.of(r)),
    ]);
    assert.equal(
      visibleSource(state, state.field(blocks)),
      "before\n\n\n\nafter",
    );
    for (let at = doc.indexOf("$$"); at <= doc.lastIndexOf("$$") + 2; at++) {
      state = state.update({ selection: EditorSelection.single(at) }).state;
      assert.equal(visibleSource(state, state.field(blocks)), doc);
    }
  } finally {
    await f.root.dispose();
  }
});

test("Obsidian tag widgets keep the literal hash and label at every caret position", async () => {
  const f = fixture();
  try {
    f.root.plugin(tagsWebview);
    await f.root.settled();
    const doc = "aa #tag zz";
    for (let at = 0; at <= doc.length; at++) {
      const state = stateFor(
        doc,
        EditorSelection.single(at),
        f.view.state.facet(inlineRenderers).map((r) => inlineRenderers.of(r)),
      );
      inlineDecorations(state, [{ from: 0, to: doc.length }]).between(
        0,
        doc.length,
        (from, to, value) => {
          if (value.point && from < to) {
            assert.equal(`#${value.spec.widget.tag}`, doc.slice(from, to));
          }
        },
      );
    }
  } finally {
    await f.root.dispose();
  }
});

test("inline chains inside task text leave the checkbox rendered", () => {
  const doc = "- [ ] **a**~~b~~";
  assert.equal(
    visibleSource(
      stateFor(doc, EditorSelection.single(8), inlineRenderers.of(inlineTasks)),
    ),
    " **a**~~b~~",
  );
});
