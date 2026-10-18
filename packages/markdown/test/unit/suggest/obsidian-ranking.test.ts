import test from "node:test";
import assert from "node:assert/strict";
import { metadata } from "../../../src/markdown/metadata";
import { suggestions } from "../../../src/plugins/suggest/sources";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";

// Every expected list is Obsidian 1.14.4's, from its own `[[` suggester run
// over the same notes in a throwaway vault (2026-10-17).
const NOTES: Record<string, string> = {
  "Project Plan.md": "# Project Plan\n\n## Goals\n\n## Timeline\n\n#project\n",
  "projects/Roadmap 2024.md": "---\naliases: [Plan 2024]\n---\n# Roadmap\n",
  "Meeting Notes.md": "# Meeting Notes\n\n## Attendees\n\n## Action Items\n",
  "meetings/2024-01-15 Standup.md": "standup\n",
  "Reading List.md": "---\naliases: [Books]\n---\nlist\n",
  "Notebook.md": "nb\n",
  "No Title.md": "x\n",
  "people/Alice.md": "---\naliases: [Al]\n---\nhi\n",
  "people/Bob Smith.md": "bob\n",
  "Proposal Draft.md": "draft #project/draft\n",
  "archive/Old Project.md": "old\n",
  "other.md": "# Other\n\nbody\n",
  "probe.md": "",
  "pic.png": "",
};

function vault() {
  const index = new MemoryVaultIndex({
    root: "file:///vault",
    folderNote: "",
    linkFormat: "shortest",
  });
  for (const [path, text] of Object.entries(NOTES)) {
    index.upsertFile({
      path,
      uri: `file:///vault/${path}`,
      size: text.length,
      mtime: 0,
      excluded: false,
    });
    if (path.endsWith(".md")) {
      index.setMetadata(path, metadata(text));
    }
  }
  return index;
}

const labels = (query: string, kind: "link" | "tag" = "link") =>
  suggestions(vault(), "probe.md", { kind, query }).map((item) => item.label);
const first = (query: string, count: number) => labels(query).slice(0, count);

test("a note matched by its name comes before one matched only through its folder", () => {
  assert.deepEqual(first("pro", 5), [
    "probe",
    "Project Plan",
    "Proposal Draft",
    "Old Project",
    "Roadmap 2024",
  ]);
  assert.deepEqual(first("proj", 3), [
    "Project Plan",
    "Old Project",
    "Roadmap 2024",
  ]);
});

test("an alias is offered only when the query matches the alias", () => {
  assert.deepEqual(first("al", 5), [
    "Al",
    "Alice",
    "Proposal Draft",
    "Reading List",
    "Old Project",
  ]);
  assert.deepEqual(labels("books"), ["Books"]);
});

test("a note's path is matched without .md, and never its description", () => {
  assert.deepEqual(labels("old"), ["Old Project", "Proposal Draft"]);
});

test("letters matched one by one rank by how close together and how early they are", () => {
  assert.deepEqual(first("nt", 5), [
    "No Title",
    "Notebook",
    "Meeting Notes",
    "Reading List",
    "2024-01-15 Standup",
  ]);
});

// Obsidian 1.14: a letter matched inside a word, not right after the one
// before it, costs a tenth.
test("letters that start words rank higher", () => {
  assert.deepEqual(first("rp", 4), [
    "Roadmap 2024",
    "Project Plan",
    "Proposal Draft",
    "Old Project",
  ]);
  assert.deepEqual(labels("bs"), ["Bob Smith", "Books"]);
  assert.deepEqual(first("oe", 10), [
    "other",
    "Old Project",
    "Notebook",
    "probe",
    "Project Plan",
    "Meeting Notes",
    "No Title",
    "Roadmap 2024",
    "Alice",
    "Bob Smith",
  ]);
});

test("a whole word matched at a word start beats one matched inside a word", () => {
  assert.deepEqual(first("st", 4), [
    "2024-01-15 Standup",
    "Reading List",
    "Bob Smith",
    "Proposal Draft",
  ]);
});

test("a note's headings, with nothing typed, come in document order", () => {
  assert.deepEqual(
    suggestions(vault(), "probe.md", {
      kind: "heading",
      query: "",
      note: "Project Plan",
    }).map((item) => item.label),
    ["Project Plan", "Goals", "Timeline"],
  );
});

// Measured by running Obsidian's own suggester over the same four notes.
function datedVault() {
  const index = new MemoryVaultIndex({
    root: "file:///vault",
    folderNote: "",
    linkFormat: "shortest",
  });
  const notes: [string, number, string, boolean][] = [
    ["Old.md", 100, "[[Missing]]", false],
    ["Fresh.md", 300, "---\naliases: [New]\n---\n", false],
    ["Middle.md", 200, "", false],
    ["Hidden Plan.md", 400, "", true],
  ];
  for (const [path, mtime, text, excluded] of notes) {
    index.upsertFile({
      path,
      uri: `file:///vault/${path}`,
      size: text.length,
      mtime,
      excluded,
    });
    index.setMetadata(path, metadata(text));
  }
  return index;
}

test("with nothing typed, notes come newest first, an excluded one left out", () => {
  const listed = suggestions(datedVault(), "Old.md", {
    kind: "link",
    query: "",
  }).map((item) => item.label);
  assert.deepEqual(listed, ["Fresh", "New", "Middle", "Old", "Missing"]);
});

test("an excluded note is still offered, ranked 10 points lower", () => {
  const listed = (query: string) =>
    suggestions(datedVault(), "Old.md", { kind: "link", query }).map(
      (item) => item.label,
    );
  assert.deepEqual(listed("plan"), ["Hidden Plan"]);
  assert.deepEqual(listed("n"), ["New", "Missing", "Hidden Plan"]);
});
