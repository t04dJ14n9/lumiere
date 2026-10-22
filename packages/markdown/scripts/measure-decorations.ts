/**
 * Live Preview decoration cost on a large block-heavy document (R2-10):
 * first, middle and last edits and caret-only moves. Prints renderer
 * `match` calls, widgets constructed and transaction time per case.
 * Run: pnpm exec tsx scripts/measure-decorations.ts [blocks]
 */
import { EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import { blockIndex, renderRevision } from "../src/plugins/livePreview/blocks";
import { blockDecorations } from "../src/plugins/livePreview/viewport-decorations";
import { documentTree } from "../src/plugins/livePreview/document-tree";
import { blockRenderers } from "../src/plugins/livePreview/registry";
import type { RenderBlock } from "../src/plugins/livePreview/api";

export const counters = { match: 0, widgets: 0 };
class SourceWidget extends WidgetType {
  constructor(readonly block: RenderBlock) {
    super();
    counters.widgets++;
  }
  override eq(other: SourceWidget): boolean {
    return other.block.source === this.block.source;
  }
  toDOM(): HTMLElement {
    throw new Error("not mounted");
  }
}
const widget = (block: RenderBlock) => new SourceWidget(block);
const counted = (name: string) => (node: { name: string }) => {
  counters.match++;
  return node.name === name;
};
export const extensions: Extension[] = [
  documentTree,
  renderRevision,
  blockIndex,
  blockDecorations((error) => {
    throw error;
  }),
  blockRenderers.of({
    kind: "Table",
    editing: "widget",
    match: counted("Table"),
    widget,
  }),
  blockRenderers.of({
    kind: "Blockquote",
    editing: "reveal",
    match: counted("Blockquote"),
    widget,
  }),
  blockRenderers.of({
    kind: "FencedCode",
    editing: "reveal",
    editingPreview: { sourceClass: "is-editing" },
    match: counted("FencedCode"),
    widget,
  }),
];

export function blockHeavy(blocks: number): string {
  const chunks = [
    "| a | b |\n| - | - |\n| 1 | 2 |",
    "> quoted\n> more",
    "```js\nlet x = 1;\n```",
    "Plain paragraph text.",
  ];
  return Array.from(
    { length: blocks },
    (_, i) => chunks[i % chunks.length],
  ).join("\n\n");
}

export function measure(blocks: number, runs = 1, only?: Extension[]) {
  const doc = blockHeavy(blocks);
  const base = EditorState.create({ doc, extensions: only ?? extensions });
  const paragraph = (fraction: number) => {
    const at = Math.floor(doc.length * fraction);
    return doc.indexOf("Plain paragraph", at);
  };
  const cases = {
    "edit first": { changes: { from: paragraph(0), insert: "x" } },
    "edit middle": { changes: { from: paragraph(0.5), insert: "x" } },
    "edit last": { changes: { from: paragraph(0.999), insert: "x" } },
    "caret first": { selection: { anchor: paragraph(0) } },
    "caret middle": { selection: { anchor: paragraph(0.5) } },
    "caret last": { selection: { anchor: paragraph(0.999) } },
  };
  const results: Record<
    string,
    { match: number; widgets: number; ms: number }
  > = {};
  for (const [name, spec] of Object.entries(cases)) {
    const times: number[] = [];
    for (let run = 0; run < runs; run++) {
      counters.match = 0;
      counters.widgets = 0;
      const started = performance.now();
      void base.update(spec).state;
      times.push(performance.now() - started);
    }
    const ms = times.sort((a, b) => a - b)[Math.floor(runs / 2)]!;
    results[name] = {
      match: counters.match,
      widgets: counters.widgets,
      ms: Math.round(ms * 100) / 100,
    };
  }
  return results;
}

if (process.argv[1]?.endsWith("measure-decorations.ts")) {
  const blocks = Number(process.argv[2] ?? 4000);
  measure(blocks, 5); // warm up
  console.log(
    `${blocks} blocks (${blockHeavy(blocks).length} chars), median of 21`,
  );
  console.table(measure(blocks, 21));
  console.log("syntax tree alone (the baseline the editor pays anyway)");
  console.table(measure(blocks, 21, [documentTree]));
}
