import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import { parseMarkdown, markdownParser } from "../../markdown/dialect";
import { headerParts } from "../../markdown/properties/header-parts";
import { blockIndex } from "./blocks";
import { documentTree } from "./document-tree";
import { blockRenderers } from "./registry";
import {
  completeFrontmatter,
  frontmatterFenceEnd,
  frontmatterPlaceholderRenderer,
} from "./frontmatter-placeholder";

/** Tall fence past the 10 KB first-paint band (synthetic; no vault fixtures). */
const longFence = `---\n${"x: y\n".repeat(4000)}---\n\n# Heading\n\nbody\n`;

function frontmatterNode(
  tree: ReturnType<typeof parseMarkdown>,
): SyntaxNodeRef {
  let found: SyntaxNodeRef | undefined;
  tree.iterate({
    enter(node) {
      if (node.name === "Frontmatter") {
        // iterate's SyntaxNodeRef is only valid during the callback.
        found = node.node;
        return false;
      }
    },
  });
  assert.ok(found, "expected a Frontmatter node");
  return found!;
}

test("completeFrontmatter accepts a truncated first-paint Frontmatter when the fence closes later", () => {
  assert.ok(longFence.length > 20_000);
  const state = EditorState.create({ doc: longFence });
  const truncated = markdownParser.parse(longFence.slice(0, 10_000));
  const node = frontmatterNode(truncated);
  assert.ok(node.to < 15_000);
  assert.equal(completeFrontmatter(state, node), true);
  const end = frontmatterFenceEnd(state, node);
  assert.ok(end !== undefined && end > node.to);
});

test("completeFrontmatter rejects an unclosed fence", () => {
  const open = `---\n${"x: y\n".repeat(4000)}`;
  const state = EditorState.create({ doc: open });
  const truncated = markdownParser.parse(open.slice(0, 10_000));
  const node = frontmatterNode(truncated);
  assert.equal(completeFrontmatter(state, node), false);
  assert.equal(frontmatterFenceEnd(state, node), undefined);
});

test("completeFrontmatter accepts a full-document Frontmatter fence", () => {
  const state = EditorState.create({ doc: longFence });
  const node = frontmatterNode(parseMarkdown(state.doc));
  assert.equal(completeFrontmatter(state, node), true);
});

test("placeholder range covers the full fence past a truncated Frontmatter node", () => {
  const state = EditorState.create({ doc: longFence });
  const truncated = markdownParser.parse(longFence.slice(0, 10_000));
  const node = frontmatterNode(truncated);
  const renderer = frontmatterPlaceholderRenderer();
  assert.ok(renderer.range);
  const range = renderer.range!(node, state);
  const header = headerParts(longFence)!;
  assert.equal(range.from, 0);
  assert.equal(range.to, header.end);
  assert.ok(range.to > node.to);
});

test("placeholder collapses tall fence on the truncated first-paint document tree", () => {
  const placeholder = frontmatterPlaceholderRenderer();
  const state = EditorState.create({
    doc: longFence,
    extensions: [documentTree, blockIndex, blockRenderers.of(placeholder)],
  });
  const tree = state.field(documentTree);
  assert.ok(
    tree.length < longFence.length,
    "first-paint tree stays truncated (no #289 widen)",
  );
  const blocks = state.field(blockIndex);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.kind, "frontmatter-placeholder");
  const header = headerParts(longFence)!;
  assert.equal(blocks[0]!.from, 0);
  assert.equal(blocks[0]!.to, header.end);
  assert.ok(
    blocks[0]!.to > tree.length,
    "decoration range extends past the prefix tree via headerParts",
  );
});

test("placeholder indexes Frontmatter until a properties renderer registers", () => {
  const doc = "---\ntitle: hi\n---\n\n# Heading\n";
  const placeholder = frontmatterPlaceholderRenderer();
  const state = EditorState.create({
    doc,
    extensions: [documentTree, blockIndex, blockRenderers.of(placeholder)],
  });
  assert.deepEqual(
    state.field(blockIndex).map((block) => block.kind),
    ["frontmatter-placeholder"],
  );

  class FakeProperties extends WidgetType {
    override toDOM(): HTMLElement {
      return document.createElement("div");
    }
  }
  const withProperties = EditorState.create({
    doc,
    extensions: [
      documentTree,
      blockIndex,
      blockRenderers.of(placeholder),
      blockRenderers.of({
        kind: "properties",
        nodes: ["Frontmatter"],
        editing: "widget",
        match: (node) => node.name === "Frontmatter",
        widget: () => new FakeProperties(),
      }),
    ],
  });
  assert.deepEqual(
    withProperties.field(blockIndex).map((block) => block.kind),
    ["properties"],
  );
});
