import test from "node:test";
import assert from "node:assert/strict";
import { metadata } from "../../../src/markdown/metadata";
import { suggestions } from "../../../src/plugins/suggest/sources";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";

// Every expected list is Obsidian's, read from its `[[` suggestions over the
// same notes in a throwaway vault (2026-10-17).
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
  assert.deepEqual(first("rp", 4), [
    "Proposal Draft",
    "Roadmap 2024",
    "Project Plan",
    "Old Project",
  ]);
  assert.deepEqual(first("nt", 5), [
    "Notebook",
    "No Title",
    "Meeting Notes",
    "Reading List",
    "2024-01-15 Standup",
  ]);
  assert.deepEqual(labels("bs"), ["Books", "Bob Smith"]);
  assert.deepEqual(first("oe", 7), [
    "Notebook",
    "probe",
    "Project Plan",
    "Meeting Notes",
    "other",
    "No Title",
    "Old Project",
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
