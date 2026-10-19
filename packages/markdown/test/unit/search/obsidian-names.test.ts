import test from "node:test";
import assert from "node:assert/strict";
import { compileSearch } from "../../../src/markdown/search/evaluate";

// Measured with Obsidian's search over the same notes in a throwaway vault
// (2026-10-17).
const NOTES = [
  { path: "people/Alice.md", text: "---\naliases: [Al]\n---\nhi\n" },
  { path: "people/Bob Smith.md", text: "bob\n" },
  { path: "s/gamma.md", text: "- [ ] call Alice\n" },
  { path: "archive/Old Project.md", text: "old\n" },
  { path: "pic.png", text: "", kind: "file" as const },
];

const found = (query: string) => {
  const matches = compileSearch(query);
  return NOTES.filter((note) => matches(note)).map((note) => note.path);
};

test("a plain term matches a note's file name as well as its text, as in Obsidian", () => {
  assert.deepEqual(found("Alice"), ["people/Alice.md", "s/gamma.md"]);
  assert.deepEqual(found("Alic"), ["people/Alice.md", "s/gamma.md"]);
  // Each term may match the name or the text.
  assert.deepEqual(found("alice hi"), ["people/Alice.md"]);
  assert.deepEqual(found('"Bob Smith"'), ["people/Bob Smith.md"]);
  assert.deepEqual(found("-Alice path:people"), ["people/Bob Smith.md"]);
});

test("the name includes its extension, but a folder is not matched and attachments are not searched", () => {
  assert.deepEqual(found("md"), [
    "people/Alice.md",
    "people/Bob Smith.md",
    "s/gamma.md",
    "archive/Old Project.md",
  ]);
  assert.deepEqual(found("people"), []);
  assert.deepEqual(found("archive"), []);
  assert.deepEqual(found("pic"), []);
});

test("operators other than plain terms do not match the name", () => {
  assert.deepEqual(found("content:Alice"), ["s/gamma.md"]);
  assert.deepEqual(found("line:(Alice)"), ["s/gamma.md"]);
});
