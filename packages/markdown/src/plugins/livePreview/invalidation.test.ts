import assert from "node:assert/strict";
import test from "node:test";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import {
  blockDecorations,
  blockIndex,
  refreshRender,
  renderRevision,
} from "./blocks";
import { documentTree } from "./document-tree";
import { renderInvalidations } from "./invalidation";
import { blockRenderers } from "./registry";
import type { RenderBlock } from "./api";

class SourceWidget extends WidgetType {
  constructor(readonly block: RenderBlock) {
    super();
  }
  override eq(other: SourceWidget): boolean {
    return other.block.source === this.block.source;
  }
  toDOM(): HTMLElement {
    throw new Error("Not mounted in a unit test");
  }
}

const widget = (block: RenderBlock) => new SourceWidget(block);
const decorations = blockDecorations((error) => {
  throw error;
});
const extensions: Extension[] = [
  documentTree,
  renderRevision,
  blockIndex,
  decorations,
  blockRenderers.of({
    kind: "Table",
    editing: "widget",
    match: (node) => node.name === "Table",
    showSource: (state, block) =>
      state.selection.ranges.some(
        (range) => range.from <= block.to && range.to >= block.from,
      ),
    widget,
  }),
  blockRenderers.of({
    kind: "Blockquote",
    editing: "reveal",
    match: (node) => node.name === "Blockquote",
    widget,
  }),
  blockRenderers.of({
    kind: "HTMLBlock",
    editing: "reveal",
    match: (node) => node.name === "HTMLBlock",
    range: (node, state) => ({
      from: state.doc.lineAt(node.from).from,
      to: node.to,
    }),
    widget,
  }),
  blockRenderers.of({
    kind: "FencedCode",
    editing: "reveal",
    editingPreview: { sourceClass: "is-editing" },
    match: (node) => node.name === "FencedCode",
    widget,
  }),
];

const CHUNKS = [
  "Plain paragraph text.",
  "# Heading",
  "> quoted\n> more",
  "> [!note] Title\n> body",
  "| a | b |\n| - | - |\n| 1 | 2 |",
  "```js\nlet x = 1;\n```",
  "```\nunclosed",
  "<div>\nhtml\n</div>",
  "- item\n- item two",
  "Setext\n===",
  "$$\nx^2\n$$",
  "[^1]: A footnote.",
  "    indented code",
];
const SNIPPETS = [
  "\n",
  "\n\n",
  "```",
  "| c |",
  "> ",
  "#",
  "x",
  "---",
  "<div>",
  "$$",
  "- ",
  "===",
  " ",
];

/** A small deterministic generator, so a failure reproduces from its seed. */
function random(seed: number) {
  let value = seed;
  return (n: number) => {
    value = (value * 1103515245 + 12345) & 0x7fffffff;
    return (value >>> 16) % n;
  };
}

function blocks(state: EditorState) {
  return state
    .field(blockIndex)
    .map(({ from, to, kind, source }) => ({ from, to, kind, source }));
}

function described(set: DecorationSet) {
  const result: unknown[] = [];
  set.between(0, Number.MAX_SAFE_INTEGER, (from, to, value) => {
    const spec = value.spec as {
      class?: string;
      widget?: { block: RenderBlock };
    };
    const block = spec.widget?.block;
    result.push([
      from,
      to,
      spec.class,
      block && [block.from, block.to, block.source],
    ]);
  });
  return result;
}

function fresh(state: EditorState) {
  return EditorState.create({
    doc: state.doc,
    selection: state.selection,
    extensions,
  });
}

test("after any edit or caret move, incremental blocks and decorations equal a full rebuild", () => {
  for (let seed = 1; seed <= 150; seed++) {
    const next = random(seed);
    const doc = Array.from(
      { length: 12 + next(30) },
      () => CHUNKS[next(CHUNKS.length)],
    ).join(next(3) ? "\n\n" : "\n");
    let state = EditorState.create({ doc, extensions });
    for (let step = 0; step < 25; step++) {
      const length = state.doc.length;
      const at = next(length + 1);
      const kind = next(4);
      const spec =
        kind === 0
          ? { selection: EditorSelection.cursor(at) }
          : kind === 1
            ? { changes: { from: at, to: Math.min(length, at + next(12)) } }
            : {
                changes: { from: at, insert: SNIPPETS[next(SNIPPETS.length)]! },
              };
      state = state.update(spec).state;
      const expected = fresh(state);
      const context = `seed ${seed}, step ${step}: ${JSON.stringify(state.doc.toString())}`;
      assert.deepEqual(blocks(state), blocks(expected), context);
      assert.deepEqual(
        described(state.field(decorations)),
        described(expected.field(decorations)),
        context,
      );
    }
  }
});

test("a caret move invalidates its lines only; an edit adds the region it touched; an effect invalidates everything", () => {
  const doc = "one\n\n> quote\n\ntwo\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nend";
  const state = EditorState.create({ doc, extensions });
  const move = state.update({ selection: { anchor: doc.indexOf("two") } });
  assert.deepEqual(renderInvalidations(move), [
    { fromLine: 1, toLine: 1, reason: "selection" },
    { fromLine: 5, toLine: 5, reason: "selection" },
  ]);
  const edit = state.update({
    changes: { from: doc.indexOf("quote"), insert: "more " },
  });
  assert.deepEqual(renderInvalidations(edit)[0], {
    fromLine: 3,
    toLine: 3,
    reason: "text",
  });
  assert.deepEqual(
    renderInvalidations(state.update({ effects: refreshRender.of(null) })),
    [{ fromLine: 1, toLine: 11, reason: "metadata" }],
  );
});

test("an edit below a block keeps its index entry, and a caret move elsewhere keeps its decoration", () => {
  const doc = "> quote\n\npara\n\n> other";
  const state = EditorState.create({ doc, extensions });
  const [first] = state.field(blockIndex);
  const edited = state.update({
    changes: { from: doc.indexOf("para"), insert: "x" },
  }).state;
  assert.equal(
    edited.field(blockIndex)[0],
    first,
    "the same object, not found again",
  );
  // The caret starts in the first quote; moving it between the paragraph
  // and the second quote leaves the first quote alone.
  const start = state.update({
    selection: { anchor: doc.indexOf("para") },
  }).state;
  const moved = start.update({
    selection: { anchor: doc.indexOf("other") },
  }).state;
  let same = false;
  start.field(decorations).between(0, 7, (_from, _to, before) => {
    moved.field(decorations).between(0, 7, (_f, _t, after) => {
      same = before === after;
    });
  });
  assert.ok(same, "the first quote's decoration was not rebuilt");
});

test("deleting a fence's closing line re-finds the blocks an old block opener it swallowed covered", () => {
  // The old math block (`$$` … `$$`) does not touch the deleted line, but
  // the fence now extends over its opener, so the text it covered parses
  // differently: the region must include it.
  const doc = "```\na\n```\nb\n\n$$\nx\n```\n\n> q\n\n$$\n\n> after";
  const state = EditorState.create({ doc, extensions });
  const close = doc.indexOf("```", 3);
  const next = state.update({ changes: { from: close, to: close + 4 } }).state;
  assert.deepEqual(blocks(next), blocks(fresh(next)));
  assert.deepEqual(
    described(next.field(decorations)),
    described(fresh(next).field(decorations)),
  );
});
