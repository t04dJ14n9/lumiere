import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import { blockDecorations, blockIndex, renderRevision } from "./blocks";
import { documentTree } from "./document-tree";
import { blockRenderers } from "./registry";
import type { RenderBlock } from "./api";

// Work per transaction on a large block-heavy document, counted rather than
// timed (scripts/measure-decorations.ts prints the timings): renderer
// `match` calls and widgets constructed.
let matched = 0;
let built = 0;
class CountedWidget extends WidgetType {
  constructor(readonly block: RenderBlock) {
    super();
    built++;
  }
  override eq(other: CountedWidget): boolean {
    return other.block.source === this.block.source;
  }
  toDOM(): HTMLElement {
    throw new Error("Not mounted in a unit test");
  }
}
const renderer = (kind: string, editing: "reveal" | "widget") =>
  blockRenderers.of({
    kind,
    editing,
    match: (node) => (matched++, node.name === kind),
    widget: (block) => new CountedWidget(block),
  });
const extensions = [
  documentTree,
  renderRevision,
  blockIndex,
  blockDecorations((error) => {
    throw error;
  }),
  renderer("Table", "widget"),
  renderer("Blockquote", "reveal"),
  renderer("FencedCode", "reveal"),
];
const BLOCKS = 4000;
const doc = Array.from(
  { length: BLOCKS },
  (_, i) =>
    [
      "| a | b |\n| - | - |\n| 1 | 2 |",
      "> quoted\n> more",
      "```js\nlet x = 1;\n```",
      "Plain paragraph text.",
    ][i % 4],
).join("\n\n");
const state = EditorState.create({ doc, extensions });
const paragraph = (fraction: number) =>
  doc.indexOf("Plain paragraph", Math.floor(doc.length * fraction));

function cost(spec: TransactionSpec) {
  matched = 0;
  built = 0;
  void state.update(spec).state;
  return { matched, built };
}

test("a caret move anywhere decorates only the blocks it enters or leaves", () => {
  for (const fraction of [0, 0.5, 0.999]) {
    const { matched, built } = cost({
      selection: { anchor: paragraph(fraction) },
    });
    assert.equal(matched, 0);
    assert.ok(built <= 2, `${built} widgets for a caret move`);
  }
});

test("an edit matches renderers only in the region it changed", () => {
  for (const fraction of [0, 0.5, 0.999]) {
    const { matched } = cost({
      changes: { from: paragraph(fraction), insert: "x" },
    });
    assert.ok(matched <= 12, `${matched} renderer matches for one edit`);
  }
});

test("an edit rebuilds the widgets after it (they hold source coordinates), never those before", () => {
  // Shifted blocks get new widgets so callbacks see current positions;
  // their DOM is kept because the widgets compare equal by source.
  const last = cost({ changes: { from: paragraph(0.999), insert: "x" } });
  assert.ok(last.built <= 4, `${last.built} widgets for an edit at the end`);
  const middle = cost({ changes: { from: paragraph(0.5), insert: "x" } });
  assert.ok(middle.built <= (BLOCKS * 3) / 8 + 4, `${middle.built} widgets`);
});
