import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLineColEdits,
  cleanEditedUris,
  expectedOpenEditorText,
  offsetAt,
  partitionLinkUpdateFiles,
} from "../../../src/host/rename-save";

const edit = {
  start: { line: 0, col: 0 },
  end: { line: 0, col: 1 },
  text: "x",
};

test("only notes without unsaved changes are saved after a link update", () => {
  const files = [
    { uri: "file:///a.md", edits: [edit] },
    { uri: "file:///b.md", edits: [edit] },
    { uri: "file:///c.md", edits: [] },
  ];
  assert.deepEqual(
    cleanEditedUris(files, (uri) => uri === "file:///b.md"),
    ["file:///a.md"],
  );
});

test("offsetAt walks LF lines", () => {
  assert.equal(offsetAt("ab\ncd\n", 1, 1), 4);
  assert.equal(offsetAt("ab\ncd", 0, 2), 2);
});

test("applyLineColEdits rewrites all five link forms on an open note", () => {
  const text = [
    "[[Wave5Closed]]",
    "[[Wave5Closed|the target]]",
    "[[Wave5Closed#Wave5 target]]",
    "[go](Wave5Closed.md)",
    "![[Wave5Closed]]",
  ].join("\n");
  const edits = [
    {
      start: { line: 0, col: 0 },
      end: { line: 0, col: 15 },
      text: "[[Wave5Open]]",
    },
    {
      start: { line: 1, col: 0 },
      end: { line: 1, col: 26 },
      text: "[[Wave5Open|the target]]",
    },
    {
      start: { line: 2, col: 0 },
      end: { line: 2, col: 28 },
      text: "[[Wave5Open#Wave5 target]]",
    },
    {
      start: { line: 3, col: 0 },
      end: { line: 3, col: 20 },
      text: "[go](Wave5Open.md)",
    },
    {
      start: { line: 4, col: 0 },
      end: { line: 4, col: 16 },
      text: "![[Wave5Open]]",
    },
  ];
  assert.equal(
    applyLineColEdits(text, edits),
    [
      "[[Wave5Open]]",
      "[[Wave5Open|the target]]",
      "[[Wave5Open#Wave5 target]]",
      "[go](Wave5Open.md)",
      "![[Wave5Open]]",
    ].join("\n"),
  );
});

test("expectedOpenEditorText covers only notes that are open (BH-014)", () => {
  const files = [
    {
      uri: "file:///linker.md",
      edits: [
        {
          start: { line: 0, col: 2 },
          end: { line: 0, col: 5 },
          text: "Open",
        },
      ],
    },
    {
      uri: "file:///closed.md",
      edits: [
        {
          start: { line: 0, col: 0 },
          end: { line: 0, col: 3 },
          text: "new",
        },
      ],
    },
  ];
  const expected = expectedOpenEditorText(files, (uri) =>
    uri === "file:///linker.md" ? "[[Old]]" : undefined,
  );
  assert.deepEqual(
    [...expected.entries()],
    [["file:///linker.md", "[[Open]]"]],
  );
});

test("partitionLinkUpdateFiles keeps closed notes for waitUntil disk save", () => {
  const files = [
    {
      uri: "file:///open.md",
      edits: [
        {
          start: { line: 0, col: 2 },
          end: { line: 0, col: 5 },
          text: "Open",
        },
      ],
    },
    {
      uri: "file:///closed.md",
      edits: [
        {
          start: { line: 0, col: 0 },
          end: { line: 0, col: 3 },
          text: "new",
        },
      ],
    },
    { uri: "file:///empty.md", edits: [] },
  ];
  const { open, closed } = partitionLinkUpdateFiles(
    files,
    new Set(["file:///open.md"]),
    (uri) => (uri === "file:///open.md" ? "[[Old]]" : "[[Old]]"),
  );
  assert.deepEqual([...open.entries()], [["file:///open.md", "[[Open]]"]]);
  assert.deepEqual(
    closed.map((file) => file.uri),
    ["file:///closed.md", "file:///empty.md"],
  );
});

test("a textDocument that is not a Lumière tab stays on the closed disk path", () => {
  const files = [
    {
      uri: "file:///warmed.md",
      edits: [
        {
          start: { line: 0, col: 0 },
          end: { line: 0, col: 3 },
          text: "new",
        },
      ],
    },
  ];
  // Warmed / leftover TextDocument text exists, but no Lumière tab → closed.
  const { open, closed } = partitionLinkUpdateFiles(
    files,
    new Set(),
    () => "old",
  );
  assert.equal(open.size, 0);
  assert.deepEqual(
    closed.map((file) => file.uri),
    ["file:///warmed.md"],
  );
});

test("disk bytes yield the same planned text as an open buffer (Preview settle)", () => {
  const text = "See [[Old]] and ![[Old]].\n";
  const edits = [
    {
      start: { line: 0, col: 4 },
      end: { line: 0, col: 11 },
      text: "[[New]]",
    },
    {
      start: { line: 0, col: 16 },
      end: { line: 0, col: 24 },
      text: "![[New]]",
    },
  ];
  // Same capture path settle uses for a closed note (fs bytes) vs open buffer.
  assert.equal(applyLineColEdits(text, edits), "See [[New]] and ![[New]].\n");
});
