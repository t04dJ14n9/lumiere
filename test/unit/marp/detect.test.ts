import assert from "node:assert/strict";
import test from "node:test";
import { isMarpDocument, setMarpEnabled } from "../../../src/markdown/marp";
import { exportDeck, moveDeckOutside } from "../../../src/plugins/marp/actions";
import type { MarpActions } from "../../../src/plugins/marp/actions";
import { shouldOpenMarpAsText } from "../../../src/plugins/marp/redirect";
import type { WorkspaceFiles } from "../../../src/shared/workspace-files";

test("Marp detection matches marp-vscode's frontmatter rule", () => {
  assert.equal(isMarpDocument("---\nmarp: true\n---\n"), true);
  assert.equal(isMarpDocument("---\r\nmarp: true\r\n---\r\n"), true);
  assert.equal(isMarpDocument("\uFEFF---\nmarp: true\n---\n"), true);
  assert.equal(isMarpDocument("---\nmarp: false\n---\n"), false);
  assert.equal(isMarpDocument('---\nmarp: "true"\n---\n'), false);
  assert.equal(isMarpDocument("intro\n---\nmarp: true\n---\n"), false);
  assert.equal(isMarpDocument("---\nmarp: true\n...\n"), false);
  assert.equal(isMarpDocument("# No frontmatter\n"), false);
});

test("toggling Marp keeps the other frontmatter", () => {
  const source = "---\ntitle: Deck\ntheme: default\n---\n\n# Slide\n";
  const enabled = setMarpEnabled(source, true);
  assert.match(enabled, /title: Deck/);
  assert.match(enabled, /theme: default/);
  assert.match(enabled, /marp: true/);
  assert.equal(isMarpDocument(enabled), true);
  assert.equal(isMarpDocument(setMarpEnabled(enabled, false)), false);
  assert.match(setMarpEnabled(enabled, false), /title: Deck/);
});

test("textEditor mode redirects a deck unless it was kept", () => {
  assert.equal(
    shouldOpenMarpAsText({ mode: "textEditor", isMarp: true, allowed: false }),
    true,
  );
  assert.equal(
    shouldOpenMarpAsText({ mode: "textEditor", isMarp: true, allowed: true }),
    false,
  );
  assert.equal(
    shouldOpenMarpAsText({ mode: "workbench", isMarp: true, allowed: false }),
    false,
  );
});

function recorder(): { actions: MarpActions; calls: string[] } {
  const calls: string[] = [];
  const actions: MarpActions = {
    async execute(id) {
      calls.push(id);
    },
    async reveal(uri) {
      calls.push(`reveal:${uri}`);
    },
    async apply() {
      return true;
    },
    async ask() {
      return "Cancel";
    },
    async clipboardWrite() {},
    inform() {},
    error(message) {
      calls.push(`error:${message}`);
    },
    trusted: () => true,
    marpInstalled: () => true,
  };
  return { actions, calls };
}

test("export reveals the text editor before Marp's export command", async () => {
  const { actions, calls } = recorder();
  await exportDeck(actions, "file:///proj/deck.md");
  assert.deepEqual(calls, [
    "reveal:file:///proj/deck.md",
    "markdown.marp.export",
  ]);
});

test("export refuses an untrusted workspace and a missing Marp extension", async () => {
  const untrusted = recorder();
  untrusted.actions.trusted = () => false;
  await exportDeck(untrusted.actions, "file:///proj/deck.md");
  assert.match(untrusted.calls[0] ?? "", /trusted/);
  const missing = recorder();
  missing.actions.marpInstalled = () => false;
  await exportDeck(missing.actions, "file:///proj/deck.md");
  assert.equal(missing.calls.includes("markdown.marp.export"), false);
});

test("moving a deck outside does not add page-contract frontmatter", async () => {
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
    async copy(from, to) {
      written.set(to, `copy:${from}`);
    },
    async move(from, to) {
      written.set(to, `move:${from}`);
    },
    async remove() {},
    async isSymbolicLink() {
      return false;
    },
    async pickFile() {
      return undefined;
    },
  };
  const deck = "---\nmarp: true\n---\n\n# Slide\n";
  const copied: string[] = [];
  await moveDeckOutside(
    {
      files,
      async execute() {},
      async apply() {
        return true;
      },
      async ask() {
        return undefined;
      },
      async clipboardWrite(text) {
        copied.push(text);
      },
      inform() {},
      error(message) {
        throw new Error(message);
      },
      trusted: () => true,
      marpInstalled: () => false,
    },
    {
      rootUri: "file:///proj",
      relativePath: "knowledge/slides.md",
      bundle: "knowledge",
      exportsPath: "exports",
      text: deck,
      sourceUri: "file:///proj/knowledge/slides.md",
      dirty: false,
    },
  );
  const moved = [...written.values()][0] ?? "";
  assert.match(moved, /^move:/);
  assert.equal(moved.includes("type:"), false);
  assert.match(copied[0] ?? "", /\]\(.*exports\/slides\.md\)/);
  assert.doesNotMatch(copied[0] ?? "", /\[\[/);
});
