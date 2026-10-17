import assert from "node:assert/strict";
import test from "node:test";
import { joinContained } from "../../../src/shared/workspace-path";
import type { WorkspaceFiles } from "../../../src/shared/workspace-files";
import { loadWikiRoot } from "../../../src/plugins/wiki/load";
import { legacyLayout, parseLayout } from "../../../src/plugins/wiki/layout";
import { notePlace } from "../../../src/plugins/wiki/place";

const SLIM = `{
  "schema": 1,
  "preset": "slim",
  "bundle": "knowledge",
  "assets": "assets",
  "inbox": "inbox",
  "code": "code",
  "exports": "exports",
  "dirs": {
    "raw": "raw",
    "concepts": "concept",
    "summaries": "summary",
    "entities": "entity",
    "comparisons": "comparisons",
    "queries": "queries",
    "roles": "roles",
    "decisions": "decisions"
  },
  "descriptions": { "concepts": "Ideas" }
}`;

test("slim layout.json keeps logical names and ignores unused keys", () => {
  const parsed = parseLayout(SLIM);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.layout?.preset, "slim");
  assert.equal(parsed.layout?.source, "layout");
  assert.equal(parsed.layout?.scratch, "scratch");
  assert.equal(parsed.layout?.dirs.concepts, "concept");
  assert.equal(parsed.layout?.dirs.summaries, "summary");
});

test("a layout that is not schema 1 or escapes the project fails", () => {
  assert.equal(parseLayout(`{"schema":2}`).ok, false);
  assert.equal(parseLayout(`{"schema":1,"bundle":"../secret"}`).ok, false);
  assert.equal(parseLayout("{").ok, false);
});

test("a missing layout is the caller's legacy fallback and does not invent dirs", () => {
  const layout = legacyLayout();
  assert.equal(layout.preset, "legacy");
  assert.equal(layout.source, "legacy");
  assert.deepEqual(layout.dirs, {});
});

test("a concept page maps to $concepts and indexes are reserved", () => {
  const layout = parseLayout(SLIM).layout!;
  assert.equal(
    notePlace(layout, "knowledge/concept/rag.md").collection,
    "$concepts",
  );
  assert.equal(notePlace(layout, "knowledge/index.md").reserved, true);
  assert.equal(notePlace(layout, "knowledge/log.md").reserved, true);
  assert.equal(notePlace(layout, "knowledge/concept/index.md").reserved, true);
  assert.equal(notePlace(layout, "knowledge/concept/rag.md").reserved, false);
  assert.equal(notePlace(layout, "assets/fig.md").insideBundle, false);
});

function filesWith(entries: Record<string, string>): WorkspaceFiles {
  return {
    async readText(uri) {
      return entries[uri];
    },
    async writeText() {},
    async list() {
      return undefined;
    },
    async mkdir() {},
    async copy() {},
    async move() {},
    async remove() {},
    async isSymbolicLink() {
      return false;
    },
    async pickFile() {
      return undefined;
    },
  };
}

test("a missing layout.json loads legacy and a broken one does not", async () => {
  const root = "file:///proj";
  const layoutUri = joinContained(root, ".wiki/layout.json")!;
  const missing = await loadWikiRoot(root, filesWith({}));
  assert.equal(missing.project?.layout.source, "legacy");
  assert.equal(missing.project?.layout.bundle, "knowledge");
  const broken = await loadWikiRoot(root, filesWith({ [layoutUri]: "{" }));
  assert.equal(broken.project, undefined);
  assert.equal(broken.diagnostics[0]?.items[0]?.severity, "error");
});

test("registry bundle disagreement warns and the layout path wins", async () => {
  const root = "file:///proj";
  const layoutUri = joinContained(root, ".wiki/layout.json")!;
  const registryUri = joinContained(root, ".wiki/registry.json")!;
  const loaded = await loadWikiRoot(
    root,
    filesWith({
      [layoutUri]: SLIM,
      [registryUri]: JSON.stringify({
        bundle: "other",
        types: { Concept: { folder: "$concepts" } },
      }),
    }),
  );
  assert.equal(loaded.project?.layout.bundle, "knowledge");
  assert.equal(loaded.project?.registryTypes.Concept, "$concepts");
  assert.match(
    loaded.diagnostics[0]?.items[0]?.message ?? "",
    /does not match/,
  );
});
