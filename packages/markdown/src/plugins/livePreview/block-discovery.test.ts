import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { Compartment, EditorState, StateEffect } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import type { BlockRenderer } from "./api";
import { blockIndex } from "./blocks";
import { documentTree, replaceDocumentTree } from "./document-tree";
import { parseMarkdown } from "../../markdown/dialect";
import { blockRenderers } from "./registry";

class UnmountedWidget extends WidgetType {
  toDOM(): HTMLElement {
    throw new Error("Not mounted");
  }
}
const widget = () => new UnmountedWidget();
const renderer = (name: string): BlockRenderer => ({
  kind: name,
  nodes: [name],
  editing: "reveal",
  match: (node) => node.name === name,
  widget,
});
const indexed = (state: EditorState) =>
  state
    .field(blockIndex)
    .map(({ from, to, kind, source }) => ({ from, to, kind, source }));

function withoutNodeHints(renderer: BlockRenderer): BlockRenderer {
  const unrestricted = { ...renderer };
  delete unrestricted.nodes;
  return unrestricted;
}

test("renderer registration discovers block syntax once and matches only declared node types", () => {
  const compartment = new Compartment();
  let state = EditorState.create({
    doc: Array.from(
      { length: 4000 },
      (_, index) => `Paragraph **${index}**.`,
    ).join("\n\n"),
    extensions: [documentTree, compartment.of([])],
  });
  // Discovery cache coverage needs the full tree, not the first-paint prefix.
  if (state.field(documentTree).length < state.doc.length) {
    state = state.update({
      effects: replaceDocumentTree.of(parseMarkdown(state.doc)),
    }).state;
  }
  const tree = state.field(documentTree);
  const spy = mock.method(tree, "iterate");
  let matched = 0;
  const paragraph = {
    ...renderer("Paragraph"),
    match(node: { name: string }) {
      assert.equal(node.name, "Paragraph");
      matched++;
      return false;
    },
  };
  try {
    state = state.update({
      effects: StateEffect.appendConfig.of(blockIndex),
    }).state;
    assert.equal(
      spy.mock.callCount(),
      0,
      "an empty renderer registry needs no discovery",
    );
    state = state.update({
      effects: compartment.reconfigure(blockRenderers.of(paragraph)),
    }).state;
    state = state.update({
      effects: compartment.reconfigure([
        blockRenderers.of(renderer("Table")),
        blockRenderers.of(paragraph),
      ]),
    }).state;
    assert.equal(matched, 8000);
    assert.equal(spy.mock.callCount(), 1);
    assert.deepEqual(indexed(state), []);
  } finally {
    spy.mock.restore();
  }
});

test("declared block discovery preserves nesting, precedence and ranges through edits", () => {
  const renderers: BlockRenderer[] = [
    {
      ...renderer("FencedCode"),
      kind: "special",
      match: (node, state) =>
        node.name === "FencedCode" &&
        state.sliceDoc(node.from, node.to).includes("special"),
    },
    renderer("Frontmatter"),
    renderer("Table"),
    renderer("MathBlock"),
    renderer("FencedCode"),
    {
      ...renderer("Blockquote"),
      match: (node, state) =>
        node.name === "Blockquote" &&
        state.sliceDoc(node.from, node.to).includes("[!"),
    },
    renderer("Paragraph"),
  ];
  const source =
    "---\nx: true\n---\n\n> ordinary\n>\n> > [!note]\n> > nested\n\n- **item**\n  - nested\n\n```special\nvalue\n```\n\n```ts\nvalue\n```\n\n$$\nx\n$$\n\n| a |\n| - |\n| b |\n\nend";
  const makeState = (declared: boolean) =>
    EditorState.create({
      doc: source,
      extensions: [
        documentTree,
        blockIndex,
        ...renderers.map((entry) =>
          blockRenderers.of(declared ? entry : withoutNodeHints(entry)),
        ),
      ],
    });
  let declared = makeState(true);
  let unrestricted = makeState(false);
  assert.deepEqual(indexed(declared), indexed(unrestricted));
  for (const insert of [
    "more ",
    "\n\n> quoted\n\n",
    "```md\n",
    "\n```\n",
    "\n\n# heading\n",
  ]) {
    const changes = { from: Math.floor(declared.doc.length / 2), insert };
    declared = declared.update({ changes }).state;
    unrestricted = unrestricted.update({ changes }).state;
    assert.deepEqual(indexed(declared), indexed(unrestricted));
  }
});

test("unrestricted and inline node renderers retain full discovery", () => {
  for (const nodes of [undefined, ["StrongEmphasis"]]) {
    const state = EditorState.create({
      doc: "Paragraph **bold** text.",
      extensions: [
        documentTree,
        blockIndex,
        blockRenderers.of({
          ...withoutNodeHints(renderer("StrongEmphasis")),
          ...(nodes && { nodes }),
        }),
      ],
    });
    assert.deepEqual(
      indexed(state).map((block) => block.source),
      ["**bold**"],
    );
  }
});
