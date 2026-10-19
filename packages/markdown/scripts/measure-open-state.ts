/**
 * State-only diagnostics when Chromium cannot launch. This is not a first-paint
 * measurement. Run: node --import tsx scripts/measure-open-state.ts [blocks]
 */
import { Compartment, EditorState } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import { foldRange } from "../src/plugins/folding/webview";
import { blockIndex } from "../src/plugins/livePreview/blocks";
import { documentTree } from "../src/plugins/livePreview/document-tree";
import { blockRenderers } from "../src/plugins/livePreview/registry";
import { note } from "../test/support/perf-note";

const blocks = Number(process.argv[2] ?? 16000);
const source = note(blocks);
const samples: { foldingMs: number; indexingMs: number; matches: number }[] =
  [];
class UnmountedWidget extends WidgetType {
  toDOM(): HTMLElement {
    throw new Error("Not mounted");
  }
}
for (let run = 0; run < 7; run++) {
  const compartment = new Compartment();
  let state = EditorState.create({
    doc: source,
    extensions: [documentTree, blockIndex, compartment.of([])],
  });
  let started = performance.now();
  for (let number = 1; number <= 15; number++) {
    const line = state.doc.line(number);
    foldRange(state, line.from, line.to, { heading: true, indent: true });
  }
  const foldingMs = performance.now() - started;
  let matches = 0;
  // Eight successive renderer registrations, with no claimed blocks, isolate
  // discovery from widget creation and DOM work. `nodes` is ignored by the old
  // implementation and declares the same match domain in the optimized one.
  const renderers = [
    "HTMLBlock",
    "Frontmatter",
    "Table",
    "Blockquote",
    "MathBlock",
    "FencedCode",
    "Paragraph",
    "FencedCode",
  ].map((name) =>
    blockRenderers.of({
      kind: name,
      nodes: [name],
      editing: "reveal",
      match: () => {
        matches++;
        return false;
      },
      widget: () => new UnmountedWidget(),
    }),
  );
  started = performance.now();
  for (let count = 1; count <= renderers.length; count++) {
    state = state.update({
      effects: compartment.reconfigure(renderers.slice(0, count)),
    }).state;
  }
  samples.push({
    foldingMs: Math.round(foldingMs * 100) / 100,
    indexingMs: Math.round((performance.now() - started) * 100) / 100,
    matches,
  });
}
const median = (key: "foldingMs" | "indexingMs") =>
  samples.map((sample) => sample[key]).sort((a, b) => a - b)[3];
console.log(
  JSON.stringify(
    {
      blocks,
      characters: source.length,
      median: {
        foldingMs: median("foldingMs"),
        indexingMs: median("indexingMs"),
      },
      samples,
    },
    null,
    2,
  ),
);
