import test from "node:test";
import assert from "node:assert/strict";
import {
  collectGitWarmTargets,
  documentWarmEnabled,
  isWarmableMarkdown,
  nextWarmBatch,
  shouldWarmUri,
} from "../../../src/host/document-warm-policy";
import {
  createDocumentWarmer,
  warmMarkdownDocumentFor,
  type DocumentWarmHost,
} from "../../../src/host/document-warm-core";

test("auto warms only in Cursor; on and off are explicit", () => {
  assert.equal(documentWarmEnabled({ mode: "auto", appName: "Cursor" }), true);
  assert.equal(
    documentWarmEnabled({ mode: "auto", appName: "Visual Studio Code" }),
    false,
  );
  assert.equal(
    documentWarmEnabled({ mode: "on", appName: "Visual Studio Code" }),
    true,
  );
  assert.equal(documentWarmEnabled({ mode: "off", appName: "Cursor" }), false);
});

test("only file Markdown notes are warmable", () => {
  assert.equal(isWarmableMarkdown("file:///vault/Note.md"), true);
  assert.equal(isWarmableMarkdown("file:///vault/Note.markdown"), true);
  assert.equal(isWarmableMarkdown("file:///vault/a.ts"), false);
  assert.equal(isWarmableMarkdown("untitled:Untitled-1"), false);
  assert.equal(isWarmableMarkdown("git:/vault/Note.md"), false);
});

test("already-open documents are not warmed again", () => {
  const note = "file:///vault/Note.md";
  assert.equal(shouldWarmUri(note, new Set()), true);
  assert.equal(shouldWarmUri(note, new Set([note])), false);
  assert.equal(shouldWarmUri("file:///vault/a.ts", new Set()), false);
});

test("git target collection skips open notes and duplicates", () => {
  const open = new Set(["file:///vault/n01.md", "file:///vault/n02.md"]);
  const changes = [
    "file:///vault/n01.md",
    "file:///vault/n01.md",
    "file:///vault/n03.md",
    "file:///vault/a.ts",
    "file:///vault/n03.md",
    "file:///vault/n04.md",
  ];
  assert.deepEqual(collectGitWarmTargets(changes, open), [
    "file:///vault/n03.md",
    "file:///vault/n04.md",
  ]);
});

test("git warm batches are a concurrency window, not a permanent prefix", () => {
  const targets = Array.from(
    { length: 5 },
    (_, i) => `file:///vault/n${String(i + 1).padStart(2, "0")}.md`,
  );
  const first = nextWarmBatch(targets, 0, 2);
  assert.deepEqual([...first.batch], targets.slice(0, 2));
  const second = nextWarmBatch(targets, first.nextOffset, 2);
  assert.deepEqual([...second.batch], targets.slice(2, 4));
  const third = nextWarmBatch(targets, second.nextOffset, 2);
  assert.deepEqual([...third.batch], targets.slice(4, 5));
  assert.equal(third.nextOffset, 5);
});

function fakeHost(options: {
  appName?: string;
  modeFor?: (uri: string) => "auto" | "on" | "off";
  open?: Set<string>;
  fail?: Set<string>;
}): DocumentWarmHost & {
  opened: string[];
  modeUris: string[];
} {
  const opened: string[] = [];
  const modeUris: string[] = [];
  const open = options.open ?? new Set<string>();
  const fail = options.fail ?? new Set<string>();
  return {
    opened,
    modeUris,
    appName: options.appName ?? "Cursor",
    warmMode(resourceUri) {
      modeUris.push(resourceUri);
      return options.modeFor?.(resourceUri) ?? "auto";
    },
    async openTextDocument(uri) {
      opened.push(uri);
      if (fail.has(uri)) {
        throw new Error(`missing ${uri}`);
      }
      open.add(uri);
    },
    textDocumentUris() {
      return new Set(open);
    },
  };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

async function settle() {
  for (let i = 0; i < 10; i++) {
    await tick();
  }
}

test("foreground warm with off never calls openTextDocument", async () => {
  const host = fakeHost({ modeFor: () => "off" });
  await warmMarkdownDocumentFor("file:///vault/Note.md", host);
  assert.deepEqual(host.opened, []);
  assert.deepEqual(host.modeUris, ["file:///vault/Note.md"]);
});

test("foreground warm with auto outside Cursor never calls openTextDocument", async () => {
  const host = fakeHost({
    appName: "Visual Studio Code",
    modeFor: () => "auto",
  });
  await warmMarkdownDocumentFor("file:///vault/Note.md", host);
  assert.deepEqual(host.opened, []);
});

test("foreground warm passes the target URI into getConfiguration scope", async () => {
  const host = fakeHost({
    modeFor: (uri) => (uri === "file:///folder-off/Note.md" ? "off" : "on"),
  });
  await warmMarkdownDocumentFor("file:///folder-off/Note.md", host);
  await warmMarkdownDocumentFor("file:///folder-on/Note.md", host);
  assert.deepEqual(host.modeUris, [
    "file:///folder-off/Note.md",
    "file:///folder-on/Note.md",
  ]);
  assert.deepEqual(host.opened, ["file:///folder-on/Note.md"]);
});

test("background warm respects resource-scoped off", async () => {
  const host = fakeHost({
    modeFor: (uri) => (uri.startsWith("file:///off/") ? "off" : "on"),
  });
  const { warm } = createDocumentWarmer(host);
  warm("file:///off/Note.md");
  warm("file:///on/Note.md");
  await settle();
  assert.deepEqual(host.opened, ["file:///on/Note.md"]);
});

test("git sweep: already-open notes do not permanently exclude later dirty notes", async () => {
  const open = new Set(
    Array.from(
      { length: 64 },
      (_, i) => `file:///vault/n${String(i + 1).padStart(2, "0")}.md`,
    ),
  );
  const changes = [
    ...open,
    // working-tree / index duplicate of an open note still must not burn a slot
    "file:///vault/n01.md",
    "file:///vault/n65.md",
  ];
  const host = fakeHost({ open, modeFor: () => "on" });
  const { warmGitChanges } = createDocumentWarmer(host, { gitLimit: 64 });
  warmGitChanges(changes, () => true);
  await settle();
  assert.deepEqual(host.opened, ["file:///vault/n65.md"]);
});

test("git sweep drains more than one batch when many notes still need warming", async () => {
  const changes = Array.from(
    { length: 5 },
    (_, i) => `file:///vault/n${String(i + 1).padStart(2, "0")}.md`,
  );
  const host = fakeHost({ modeFor: () => "on" });
  const { warmGitChanges } = createDocumentWarmer(host, { gitLimit: 2 });
  warmGitChanges(changes, () => true);
  await settle();
  assert.deepEqual(host.opened, changes);
});

test("foreground missing-file rejection does not throw", async () => {
  const note = "file:///vault/missing.md";
  const host = fakeHost({
    modeFor: () => "on",
    fail: new Set([note]),
  });
  await warmMarkdownDocumentFor(note, host);
  assert.deepEqual(host.opened, [note]);
});
