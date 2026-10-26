import test from "node:test";
import assert from "node:assert/strict";
import { editorUrl, relativeTo } from "../../src/shell/api";
import { buildTree } from "../../src/shell/tree";

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
