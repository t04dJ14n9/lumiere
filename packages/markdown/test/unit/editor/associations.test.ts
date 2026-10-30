import assert from "node:assert/strict";
import test from "node:test";
import { createRoot } from "@workshop/core";
import {
  registerMarkdownAssociation,
  useForMarkdownInWorkspace,
  withMarkdownWorkshop,
} from "../../../src/plugins/editor/associations";
import { provideHostServices } from "../../../src/shared/host";
import { fakeHost } from "../../support/vscode-fake";

test("Markdown patterns route through the text editor; other associations stay", () => {
  assert.deepEqual(
    withMarkdownWorkshop({ "*.pdf": "pdf.preview", "*.md": "default" }),
    {
      "*.pdf": "pdf.preview",
      "*.md": "default",
      "*.markdown": "default",
    },
  );
  for (const malformed of [undefined, null, [], "x", { "*.txt": 3 }]) {
    assert.deepEqual(withMarkdownWorkshop(malformed), {
      "*.md": "default",
      "*.markdown": "default",
    });
  }
});

function harness(initial: unknown) {
  let value = initial;
  const writes: unknown[] = [];
  const messages: string[] = [];
  const errors: string[] = [];
  const storage = new Map<string, unknown>();
  const host = fakeHost({
    dialogs: {
      error: (message) => errors.push(message),
      inform: (message) => messages.push(message),
    },
    settings: {
      editorAssociations: {
        read: () => value,
        write: async (next) => {
          writes.push(next);
          value = next as typeof value;
        },
      },
    },
    storage: {
      get: <T>(key: string, fallback: T) =>
        (storage.has(key) ? storage.get(key) : fallback) as T,
      update: async (key, next) => {
        storage.set(key, next);
      },
    },
  });
  return { host, writes, messages, errors, storage };
}

test("the workspace command records Lumière and uses the native selection route", async () => {
  const h = harness({ "*.pdf": "pdf.preview" });
  await useForMarkdownInWorkspace(h.host);
  assert.deepEqual(h.writes, [
    {
      "*.pdf": "pdf.preview",
      "*.md": "default",
      "*.markdown": "default",
    },
  ]);
  assert.deepEqual([...h.storage.values()], [true]);
  await useForMarkdownInWorkspace(h.host);
  assert.equal(h.writes.length, 1, "an existing association is not rewritten");
  assert.equal(h.messages.length, 2);
  assert.match(h.messages[1]!, /already/);
  assert.deepEqual(h.errors, []);
});

test("without a workspace there is nothing to write", async () => {
  for (const h of [harness(undefined)]) {
    await useForMarkdownInWorkspace(h.host);
    assert.deepEqual(h.writes, []);
    assert.equal(h.errors.length, 1);
  }
});

test("activation migrates the old direct custom-editor association", async (t) => {
  const h = harness({
    "*.pdf": "pdf.preview",
    "*.md": "lumiere.markdown.editor",
    "*.markdown": "lumiere.markdown.editor",
  });
  const root = createRoot();
  t.after(() => root.dispose());
  provideHostServices(root, h.host);

  root.plugin({
    name: "association-migration-test",
    inject: {
      required: ["hostCommands", "settings", "dialogs", "storage"],
    },
    apply: registerMarkdownAssociation,
  });
  await root.settled();

  assert.deepEqual(h.writes, [
    {
      "*.pdf": "pdf.preview",
      "*.md": "default",
      "*.markdown": "default",
    },
  ]);
  assert.deepEqual([...h.storage.values()], [true]);
  assert.deepEqual(h.messages, [], "migration is silent");
});

test("activation migrates a workspace that only associates *.md", async (t) => {
  const h = harness({ "*.md": "lumiere.markdown.editor" });
  const root = createRoot();
  t.after(() => root.dispose());
  provideHostServices(root, h.host);
  root.plugin({
    name: "association-migration-md-only",
    inject: {
      required: ["hostCommands", "settings", "dialogs", "storage"],
    },
    apply: registerMarkdownAssociation,
  });
  await root.settled();
  assert.deepEqual(h.writes, [{ "*.md": "default", "*.markdown": "default" }]);
  assert.deepEqual([...h.storage.values()], [true]);
});
