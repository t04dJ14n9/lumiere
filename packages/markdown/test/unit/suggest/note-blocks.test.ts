import test from "node:test";
import assert from "node:assert/strict";
import { metadata } from "../../../src/markdown/metadata";
import { noteBlocks } from "../../../src/markdown/metadata/note-blocks";
import { SuggestionIndex } from "../../../src/plugins/suggest/sources";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";
import { linkSuggestion } from "../../../src/plugins/links/suggestions";
import { EditorState } from "@codemirror/state";

const NOTE =
  "---\ntitle: x\n---\n# Heading One\n\nFirst paragraph here.\nIt continues.\n\n" +
  "- item one\n- item two\n  - nested item\n\n> a quote line\n\n```js\ncode();\n```\n\n" +
  "| a | b |\n| - | - |\n| 1 | 2 |\n\nHas an id already ^existing\n\n" +
  "> [!note] Callout\n> body\n\n$$\nx^2\n$$\n\n<div>html</div>\n\n---\n\n%% comment %%\n\n" +
  "Text with footnote[^1].\n\n[^1]: footnote text\n\n1. numbered\n\n- [ ] task item\n\nLast paragraph.";

/** The note with an id added where `block` takes it. */
const withId = (block: { idAt: number; idBefore: string }) =>
  NOTE.slice(0, block.idAt) +
  `${block.idBefore}^abc123` +
  NOTE.slice(block.idAt);

// Measured in Obsidian 1.14.4: the blocks `[[Note^` offers, and where a
// picked one without an id gets it.
test("every block is offered, in order, as Obsidian lists them", () => {
  const blocks = noteBlocks(NOTE, metadata(NOTE));
  assert.deepEqual(
    blocks.map((block) => [block.text, block.id]),
    [
      ["# Heading One", undefined],
      ["First paragraph here.\nIt continues.", undefined],
      ["item one", undefined],
      ["item two\nnested item", undefined],
      ["nested item", undefined],
      ["a quote line", undefined],
      ["code();", undefined],
      ["a b\n1 2", undefined],
      ["Has an id already", "existing"],
      ["Callout\nbody", undefined],
      ["x^2", undefined],
      ["Text with footnote.", undefined],
      ["footnote text", undefined],
      ["numbered", undefined],
      ["task item", undefined],
      ["Last paragraph.", undefined],
    ],
  );
  const around = (text: string) => {
    const block = blocks.find((candidate) => candidate.text === text)!;
    const result = withId(block);
    const at = result.indexOf("^abc123");
    return result.slice(at - 6, at + 9);
  };
  assert.equal(around("# Heading One"), " One\n\n^abc123\n\n");
  assert.equal(
    around("First paragraph here.\nIt continues."),
    "nues. ^abc123\n\n",
  );
  assert.equal(around("item two\nnested item"), "m two ^abc123\n ");
  assert.equal(around("nested item"), " item ^abc123\n\n");
  assert.equal(around("code();"), "\n```\n\n^abc123\n\n");
  assert.equal(around("a b\n1 2"), " 2 |\n\n^abc123\n\n");
  assert.equal(around("Callout\nbody"), "body\n\n^abc123\n\n");
  assert.equal(around("footnote text"), " text ^abc123\n\n");
  assert.equal(around("Last paragraph."), "raph. ^abc123");
});

test("[[Note^ asks for the note's blocks, the # added with the id", () => {
  const state = EditorState.create({ doc: "see [[Blocks^fir" });
  assert.deepEqual(linkSuggestion({ state, pos: state.doc.length }), {
    from: 12,
    closeLink: true,
    kind: "block",
    query: "fir",
    note: "Blocks",
    bare: true,
  });
});

test("a picked block without an id comes with the id to add", async () => {
  const vault = new MemoryVaultIndex({
    root: "file:///vault",
    folderNote: "",
    linkFormat: "shortest",
  });
  for (const [path, text] of [
    ["Blocks.md", NOTE],
    ["Home.md", ""],
  ]) {
    vault.upsertFile({
      path: path!,
      uri: `file:///vault/${path}`,
      size: text!.length,
      mtime: 0,
      excluded: false,
    });
    vault.setMetadata(path!, metadata(text!));
  }
  const index = new SuggestionIndex(vault, async () => NOTE);
  const request = {
    kind: "block" as const,
    query: "first",
    note: "Blocks",
    bare: true,
  };
  await index.prepare("Home.md", request);
  const [first] = index.query("Home.md", request);
  assert.equal(first!.label, "First paragraph here. It continues.");
  assert.match(first!.insert, /^#\^[0-9a-f]{6}$/u);
  const id = first!.insert.slice(2);
  assert.deepEqual(first!.blockId, {
    uri: "file:///vault/Blocks.md",
    at: NOTE.indexOf("It continues.") + "It continues.".length,
    before: "First paragraph here.\nIt continues.".slice(-32),
    insert: ` ^${id}`,
    here: false,
  });
  // A block with an id links to it, and nothing is added.
  const [existing] = index.query("Home.md", { ...request, query: "existing" });
  assert.equal(existing!.insert, "#^existing");
  assert.equal(existing!.blockId, undefined);
});
