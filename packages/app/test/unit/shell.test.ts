import test from "node:test";
import assert from "node:assert/strict";
import { editorUrl, relativeTo } from "../../src/shell/api";
import { buildTree, foldersAbove } from "../../src/shell/tree";
import {
  foldersOf,
  revealFile,
  toggleFolder,
  withFolders,
} from "../../src/shell/tree-state";

test("the file tree nests folders and keeps the server's order", () => {
  const root = buildTree([
    { path: "a/b/deep.md", kind: "note" },
    { path: "a/n.md", kind: "note" },
    { path: "top.md", kind: "note" },
    { path: "z.pdf", kind: "pdf" },
  ]);
  assert.deepEqual(
    root.files.map((file) => file.path),
    ["top.md", "z.pdf"],
  );
  const a = root.folders.get("a");
  assert.equal(a?.path, "a");
  assert.deepEqual(
    a?.files.map((file) => file.path),
    ["a/n.md"],
  );
  assert.equal(a?.folders.get("b")?.path, "a/b");
  assert.deepEqual(
    a?.folders.get("b")?.files.map((file) => file.path),
    ["a/b/deep.md"],
  );
});

test("the folders that hold a file, from the vault down", () => {
  assert.deepEqual(foldersAbove("a/b/c.md"), ["a", "a/b"]);
  assert.deepEqual(foldersAbove("top.md"), []);
});

test("a folder opens and closes on a click, the others as they were", () => {
  const open = new Set(["a"]);
  const opened = toggleFolder(open, "b");
  assert.deepEqual([...opened], ["a", "b"]);
  assert.deepEqual([...toggleFolder(opened, "a")], ["b"]);
  assert.deepEqual([...open], ["a"], "the set it was given is not changed");
});

test("the shown note opens the folders that hold it and keeps the others", () => {
  const open = new Set(["other"]);
  const revealed = revealFile(open, "a/b/note.md");
  assert.deepEqual([...revealed].sort(), ["a", "a/b", "other"]);
  assert.equal(
    revealFile(revealed, "a/b/next.md"),
    revealed,
    "nothing to open: the same set, so nothing is saved",
  );
  assert.equal(revealFile(open, "top.md"), open, "a note at the top: nothing");
  const closedAbove = toggleFolder(revealed, "a");
  assert.deepEqual(
    [...revealFile(closedAbove, "a/b/note.md")].sort(),
    ["a", "a/b", "other"],
    "a folder closed above it opens again",
  );
});

test("the saved layout keeps each vault's open folders apart", () => {
  const saved = withFolders({ "/v1": ["x"] }, "/v2", new Set(["b", "a"]));
  assert.deepEqual(saved, { "/v1": ["x"], "/v2": ["a", "b"] });
  assert.deepEqual([...foldersOf(saved, "/v2")], ["a", "b"]);
  assert.deepEqual([...foldersOf(saved, "/v3")], [], "a new vault: all closed");
  assert.deepEqual(
    withFolders(saved, "/v2", new Set()),
    { "/v1": ["x"] },
    "a vault with nothing open is left out",
  );
  assert.deepEqual(
    [...foldersOf({}, "constructor")],
    [],
    "only the vaults it keeps",
  );
});

test("editor URLs carry the note's absolute path and its vault", () => {
  const url = new URL(
    editorUrl("/Users/me/notes", "daily/2026 10 22.md"),
    "http://x",
  );
  assert.equal(url.pathname, "/lumiere/editor");
  assert.equal(
    url.searchParams.get("path"),
    "/Users/me/notes/daily/2026 10 22.md",
  );
  assert.equal(url.searchParams.get("root"), "/Users/me/notes");
  const windows = new URL(editorUrl("C:\\notes\\", "a/b.md"), "http://x");
  assert.equal(windows.searchParams.get("path"), "C:\\notes\\a\\b.md");
});

test("a PDF opens in host-node's PDF viewer page, with the same query", () => {
  const url = new URL(editorUrl("/Users/me/notes", "papers/A.PDF"), "http://x");
  assert.equal(url.pathname, "/lumiere/pdf");
  assert.equal(url.searchParams.get("path"), "/Users/me/notes/papers/A.PDF");
  assert.equal(url.searchParams.get("root"), "/Users/me/notes");
});

test("an absolute path back to vault-relative, only inside the vault", () => {
  assert.equal(relativeTo("/v", "/v/a/b.md"), "a/b.md");
  assert.equal(relativeTo("/v/", "/v/a.md"), "a.md");
  assert.equal(relativeTo("/v", "/vault2/a.md"), undefined);
  assert.equal(relativeTo("/v", "/v"), undefined);
  assert.equal(relativeTo("C:\\v", "C:\\v\\a\\b.md"), "a/b.md");
});

test("a revealed node opens the folders above it and nothing else", async () => {
  const { ancestors, expandTo, isExpanded } =
    await import("../../src/shell/tree-state");
  const items = [
    {
      id: "title",
      label: "Title",
      runnable: true,
      expanded: false,
      children: [
        { id: "one", label: "One", runnable: true },
        {
          id: "two",
          label: "Two",
          runnable: true,
          expanded: false,
          children: [{ id: "two-a", label: "Two A", runnable: true }],
        },
      ],
    },
  ];
  assert.deepEqual(ancestors(items, "two-a"), ["title", "two"]);
  assert.deepEqual(ancestors(items, "title"), []);
  assert.equal(ancestors(items, "missing"), undefined);
  const chosen = new Map([["other", false]]);
  const opened = expandTo(chosen, ["title", "two"]);
  assert.equal(isExpanded(items[0]!, opened), true);
  assert.equal(opened.get("other"), false, "the reader's other choices stay");
  assert.equal(
    expandTo(opened, ["title"]),
    opened,
    "nothing to open: the same map",
  );
  assert.equal(
    isExpanded(items[0]!, new Map()),
    false,
    "the plugin's choice by default",
  );
});

test("only Markdown note and PDF paths (.md, .markdown, .pdf) open in tabs", async () => {
  const { isNotePath } = await import("../../src/shell/api");
  assert.equal(isNotePath("/vault/daily/today.md"), true);
  assert.equal(isNotePath("/vault/guide.markdown"), true);
  assert.equal(isNotePath("/vault/UPPER.MD"), true);
  assert.equal(isNotePath("/vault/paper.pdf"), true);
  assert.equal(isNotePath("/vault/image.png"), false);
  assert.equal(isNotePath("/vault/data.csv"), false);
});
