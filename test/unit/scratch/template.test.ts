import assert from "node:assert/strict";
import test from "node:test";
import { frontmatter } from "../../../src/markdown/properties";
import { pageContract } from "../../../src/shared/wiki-page";
import {
  createScratchNote,
  promoteScratchNote,
} from "../../../src/plugins/scratch/run";
import {
  noteSlug,
  promotePage,
  promoteRefusal,
  promotedStub,
  scratchNote,
} from "../../../src/plugins/scratch/template";
import type { WorkspaceFiles } from "../../../src/shared/workspace-files";
import type { ResolvedLayout } from "../../../src/plugins/wiki/api";

const layout: ResolvedLayout = {
  preset: "slim",
  bundle: "knowledge",
  assets: "assets",
  inbox: "inbox",
  exports: "exports",
  scratch: "scratch",
  dirs: { concepts: "concept" },
  source: "layout",
};

test("a scratch note has no type", () => {
  const text = scratchNote("A title", "2026-10-11T00:00:00.000Z");
  assert.equal(frontmatter(text)?.values?.type, undefined);
  assert.equal(frontmatter(text)?.values?.title, "A title");
});

test("promotion writes the fixed sections and a page contract", () => {
  const page = promotePage({
    title: "Retrieval",
    type: "Concept",
    body: "A definition.",
    at: "2026-10-11T00:00:00.000Z",
  });
  assert.match(page, /^# Retrieval\n/m);
  for (const section of [
    "Definition",
    "Explanation",
    "Examples",
    "Related",
    "Open questions",
  ]) {
    assert.match(page, new RegExp(`^## ${section}$`, "m"));
  }
  assert.match(page, /A definition\./);
  assert.equal(pageContract(frontmatter(page)?.values).ok, true);
  assert.equal(noteSlug("Retrieval augmented!"), "retrieval-augmented");
});

test("a Marp scratch note is refused even when it already has a contract", () => {
  assert.match(
    promoteRefusal("---\nmarp: true\n---\n\n# S\n") ?? "",
    /not wrapped/,
  );
  const contracted = `---
marp: true
type: Deck
generated:
  by: human
  at: 2026-10-11T00:00:00Z
---
`;
  assert.match(promoteRefusal(contracted) ?? "", /not moved or wrapped/);
  assert.equal(promoteRefusal("# Note\n"), undefined);
});

test("the stub is a portable link back to the new page", () => {
  const stub = promotedStub(
    "Retrieval",
    "../knowledge/concept/retrieval.md",
    "2026-10-11T00:00:00Z",
  );
  assert.match(
    stub,
    /\[Retrieval\]\(\.\.\/knowledge\/concept\/retrieval\.md\)/,
  );
  assert.equal(frontmatter(stub)?.values?.type, undefined);
});

test("create stays outside the bundle and promote does not write an index", async () => {
  const written = new Map<string, string>();
  const files: WorkspaceFiles = {
    async readText() {
      return undefined;
    },
    async writeText(uri, text) {
      written.set(uri, text);
    },
    async list() {
      return [];
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
  const opened: unknown[] = [];
  const io = {
    files,
    rootUri: "file:///proj",
    layout,
    execute: async (...args: unknown[]) => {
      opened.push(args);
    },
    apply: async () => true,
    inform() {},
    error(message: string) {
      throw new Error(message);
    },
  };
  await createScratchNote(io, {
    title: "Loose end",
    at: "2026-10-11T00:00:00.000Z",
    folder: "scratch",
  });
  const scratch = [...written.values()][0] ?? "";
  assert.equal(frontmatter(scratch)?.values?.type, undefined);
  assert.equal(opened.length, 1);
  written.clear();
  await promoteScratchNote(io, {
    target: { type: "Concept", logical: "concepts" },
    title: "Loose end",
    text:
      scratchNote("Loose end", "2026-10-11T00:00:00.000Z") + "A definition.\n",
    at: "2026-10-11T01:00:00.000Z",
    scratchRelative: "scratch/2026-10-11-loose-end.md",
    document: {
      id: "1",
      uri: "file:///proj/scratch/2026-10-11-loose-end.md",
      version: 1,
      isDirty: false,
      isUntitled: false,
      eol: "\n",
      getText: () => "scratch",
      save: async () => true,
    },
  });
  const page = [...written.entries()].find(([uri]) =>
    uri.includes("/concept/"),
  );
  assert.ok(page, "concept page written");
  assert.equal(
    [...written.keys()].some((uri) => uri.endsWith("/index.md")),
    false,
  );
  assert.equal(pageContract(frontmatter(page?.[1] ?? "")?.values).ok, true);
});
