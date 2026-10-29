import assert from "node:assert/strict";
import test from "node:test";
import {
  EditorState,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";
import type { Tree } from "@lezer/common";
import {
  documentTree,
  DocumentTreeParser,
  FIRST_PAINT_PARSE_CHARS,
  PARSE_AHEAD_CHARS,
  parseForFirstPaint,
  replaceDocumentTree,
  type IdleScheduler,
  type ParsedView,
} from "./document-tree";
import { syntaxTree } from "@codemirror/language";
import { backgroundUpdate } from "../editor/api";
import { DocumentParse } from "./document-parse";
import { markdownTree } from "./api";
import {
  cachedMarkdown,
  markdownLanguageSupport,
  markdownParser,
  parseMarkdown,
} from "../../markdown/dialect";
import { note } from "../../../test/support/perf-note";

const paragraph = "word ".repeat(40).trim();
/** About 160 000 characters of separate paragraphs. */
const paragraphs = `${paragraph}\n\n`.repeat(800);

function nodes(tree: Tree): string[] {
  const result: string[] = [];
  tree.iterate({
    enter: (node) => {
      result.push(`${node.name}:${node.from}-${node.to}`);
    },
  });
  return result;
}

/** The top-level syntax subtree at `position`: the same object when reused. */
function blockAt(tree: Tree, position: number): Tree | null {
  return tree.topNode.childAfter(position)!.tree;
}

test("parseForFirstPaint keeps small notes complete", () => {
  const doc = "hello\n\n# Title\n";
  const tree = parseForFirstPaint(EditorState.create({ doc }).doc);
  assert.equal(tree.length, doc.length);
});

test("parseForFirstPaint truncates large notes to the opening band", () => {
  assert.ok(paragraphs.length > FIRST_PAINT_PARSE_CHARS * 2);
  const state = EditorState.create({ doc: paragraphs });
  const tree = parseForFirstPaint(state.doc);
  assert.ok(
    tree.length <= FIRST_PAINT_PARSE_CHARS + paragraph.length + 2,
    `prefix tree length ${tree.length} within a block of the budget`,
  );
  assert.ok(tree.length < state.doc.length);
});

test("parseForFirstPaint never cuts a block at the budget", () => {
  const before = `${paragraph}\n\n`.repeat(
    Math.floor(FIRST_PAINT_PARSE_CHARS / (paragraph.length + 2)),
  );
  const code = "```ts\n" + "const value = 1;\n".repeat(20) + "```\n";
  const doc = `${before}${code}\n${paragraphs}`;
  const tree = parseForFirstPaint(EditorState.create({ doc }).doc);
  const fence = tree.topNode.childAfter(before.length)!;
  assert.equal(fence.name, "FencedCode");
  assert.equal(fence.to, before.length + code.length - 1);
  assert.ok(tree.length < doc.length);
});

test("documentTree create uses a prefix tree; replaceDocumentTree completes it", () => {
  const state = EditorState.create({
    doc: paragraphs,
    extensions: [documentTree],
  });
  const prefix = state.field(documentTree);
  assert.ok(prefix.length < state.doc.length);
  const full = parseMarkdown(state.doc);
  const next = state.update({ effects: replaceDocumentTree.of(full) }).state;
  assert.equal(next.field(documentTree).length, state.doc.length);
});

test("an edit keeps a prefix tree's reach and reuses the blocks after the edit", () => {
  const doc = note(4000);
  let state = EditorState.create({ doc, extensions: [documentTree] });
  const reach = 60000;
  const prefix = new DocumentParse(state.doc).coverTo(reach);
  state = state.update({ effects: replaceDocumentTree.of(prefix) }).state;
  const at = doc.indexOf("## Section", 20000);
  const later = doc.indexOf("Paragraph", 40000);
  const edited = state.update({ changes: { from: at, insert: "x" } }).state;
  const tree = edited.field(documentTree);
  assert.ok(tree.length >= reach, `${tree.length} still reaches ${reach}`);
  assert.ok(tree.length < edited.doc.length, "the edit parsed no further");
  assert.equal(blockAt(tree, later + 1), blockAt(prefix, later));
  assert.deepEqual(
    nodes(tree),
    nodes(markdownParser.parse(edited.doc.sliceString(0, tree.length))),
  );
});

/** A view stand-in whose idle slices and scrolling the test drives. */
function parsedView(doc: string) {
  const slices = new Set<(budget: number) => void>();
  const scheduler: IdleScheduler = {
    request(slice) {
      slices.add(slice);
      return () => slices.delete(slice);
    },
  };
  const dispatched: Transaction[] = [];
  const view = {
    state: EditorState.create({ doc, extensions: [documentTree] }),
    viewport: { from: 0, to: 2000 },
    dispatch(spec: TransactionSpec) {
      const transaction = view.state.update(spec);
      dispatched.push(transaction);
      view.state = transaction.state;
      parser.update(viewUpdate(transaction, false));
    },
  };
  const viewUpdate = (transaction: Transaction, viewportChanged: boolean) =>
    ({
      state: transaction.state,
      startState: transaction.startState,
      changes: transaction.changes,
      docChanged: transaction.docChanged,
      transactions: [transaction],
      viewportChanged,
    }) as unknown as ViewUpdate;
  const parser = new DocumentTreeParser(
    view as unknown as ParsedView,
    scheduler,
  );
  return {
    view,
    slices,
    dispatched,
    tree: () => view.state.field(documentTree),
    async scroll(from: number, to: number) {
      view.viewport = { from, to };
      parser.update(viewUpdate(view.state.update({}), true));
      await new Promise((resolve) => setImmediate(resolve));
    },
    /** Run pending slices, each allowed one block, until none are left. */
    runSlices() {
      let count = 0;
      while (slices.size) {
        const [slice] = slices;
        slices.delete(slice!);
        slice!(0);
        count++;
      }
      return count;
    },
  };
}

test("a scroll past the parsed prefix parses up to the viewport, not the whole note", async () => {
  const doc = note(4000);
  const editor = parsedView(doc);
  assert.ok(editor.tree().length < 20000);
  const to = Math.floor(doc.length / 2);
  await editor.scroll(to - 3000, to);
  const tree = editor.tree();
  assert.ok(tree.length >= to + PARSE_AHEAD_CHARS, `${tree.length} >= ${to}`);
  assert.ok(tree.length < to + PARSE_AHEAD_CHARS + 1000);
  assert.equal(cachedMarkdown(editor.view.state.doc), undefined);
  // The editor saves no view state for it.
  assert.equal(editor.dispatched.at(-1)!.annotation(backgroundUpdate), true);
});

test("idle slices finish the tree a little at a time, and it matches a fresh parse", async () => {
  const doc = note(2000);
  const editor = parsedView(doc);
  await editor.scroll(30000, 33000);
  const slices = editor.runSlices();
  assert.ok(slices > 100, `${slices} slices`);
  const tree = editor.tree();
  assert.equal(tree.length, doc.length);
  assert.equal(cachedMarkdown(editor.view.state.doc), tree);
  assert.deepEqual(nodes(tree), nodes(markdownParser.parse(doc)));
});

test("an edit hands the background parse's progress to the next document", () => {
  const editor = EditorState.create({ doc: note(4000) });
  const parse = DocumentParse.from(editor.doc, parseForFirstPaint(editor.doc));
  // One block per call: stop well short of the end, as an idle slice would.
  for (let block = 0; block < 2000; block++) {
    assert.equal(parse.work(-Infinity), false);
  }
  const later = editor.doc.toString().indexOf("Paragraph", 50000);
  const edit = editor.update({ changes: { from: 10, insert: "x" } });
  const fragments = parse.fragmentsAfter(edit.changes, edit.newDoc);
  const progress = fragments.find(
    (fragment) => fragment.from <= later && fragment.to > later + 1000,
  );
  assert.ok(progress, "the unfinished parse's blocks became fragments");
  const next = new DocumentParse(edit.newDoc, fragments).coverTo(later + 1000);
  assert.equal(
    blockAt(next, later + 1),
    blockAt(progress.tree, later - progress.offset),
  );
});

test("the background parse adopts a tree another reader already made", () => {
  const doc = note(2000);
  const editor = parsedView(doc);
  const full = parseMarkdown(editor.view.state.doc);
  assert.equal(editor.runSlices(), 1);
  assert.equal(editor.tree(), full);
});

test("markdownTree reads Live Preview's tree, else CodeMirror's, else parses", () => {
  const doc = "# Title\n\nbody";
  const language = markdownLanguageSupport();
  const live = EditorState.create({
    doc,
    extensions: [documentTree, language],
  });
  assert.equal(markdownTree(live), live.field(documentTree));
  const source = EditorState.create({ doc, extensions: [language] });
  assert.equal(markdownTree(source), syntaxTree(source));
  const bare = EditorState.create({ doc });
  assert.equal(markdownTree(bare), parseMarkdown(bare.doc));
});
