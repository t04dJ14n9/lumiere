import assert from "node:assert/strict";
import test from "node:test";
import { parseLayout } from "../../../src/plugins/wiki/layout";
import { diagnoseNote } from "../../../src/plugins/wiki/diagnose";
import { copyWikiReference } from "../../../src/plugins/wiki/copy";
import type { BridgeCapture } from "../../../src/plugins/bridge/api";

const layout = parseLayout(`{
  "schema": 1,
  "preset": "slim",
  "bundle": "knowledge"
}`).layout!;

const CONTRACT = `---
type: Concept
title: RAG
generated:
  by: human:workbench
  at: 2026-10-11T00:00:00Z
---
`;

test("a wikilink inside the bundle is an error, including outside a fence", () => {
  const items = diagnoseNote(
    layout,
    "knowledge/concept/rag.md",
    `${CONTRACT}\nSee [[Other]].\n\n\`\`\`\n[[Hidden]]\n\`\`\`\n`,
  );
  assert.equal(items.length, 1);
  assert.match(items[0]!.message, /Markdown link/);
});

test("a wikilink in frontmatter or outside the bundle is not reported", () => {
  assert.equal(
    diagnoseNote(
      layout,
      "knowledge/concept/rag.md",
      CONTRACT.replace("title: RAG", 'title: "[[RAG]]"'),
    ).length,
    0,
  );
  assert.equal(
    diagnoseNote(layout, "scratch/note.md", "See [[Other]].\n").length,
    0,
  );
});

test("a Marp deck inside the bundle needs a page contract and is not wrapped", () => {
  const items = diagnoseNote(
    layout,
    "knowledge/concept/slides.md",
    "---\nmarp: true\n---\n\n# Slide\n",
  );
  assert.match(items[0]!.message, /will not add that frontmatter/);
});

test("a typed page and a bundle index are accepted", () => {
  assert.equal(
    diagnoseNote(layout, "knowledge/concept/rag.md", CONTRACT).length,
    0,
  );
  assert.equal(
    diagnoseNote(layout, "knowledge/index.md", "# Index\n").length,
    0,
  );
});

test("a page in the bundle without a type is reported", () => {
  const items = diagnoseNote(layout, "knowledge/concept/rag.md", "# RAG\n");
  assert.match(items[0]!.message, /no type property/);
});

test("wiki copy writes the clipboard and does not need an agent command", async () => {
  const written: string[] = [];
  const notes: string[] = [];
  const errors: string[] = [];
  const capture: BridgeCapture = {
    async markdownSelection() {
      return {
        text: "@notes/a.md#1\n\n> Hello",
        envelope: { version: 1 } as never,
      };
    },
    async activeSelection() {
      return undefined;
    },
  };
  await copyWikiReference({
    capture,
    place: undefined,
    noteText: undefined,
    json: false,
    clipboard: {
      async write(text) {
        written.push(text);
      },
    },
    inform: (message) => notes.push(message),
    error: (message) => errors.push(message),
  });
  assert.equal(written[0], "@notes/a.md#1\n\n> Hello");
  assert.match(notes[0]!, /No agent was started/);
  assert.deepEqual(errors, []);
});

test("wiki copy tells the user to turn the bridge on", async () => {
  const errors: string[] = [];
  await copyWikiReference({
    capture: undefined,
    place: undefined,
    noteText: undefined,
    json: false,
    clipboard: { async write() {} },
    inform() {},
    error: (message) => errors.push(message),
  });
  assert.match(errors[0]!, /Turn on the Bridge plugin/);
});
