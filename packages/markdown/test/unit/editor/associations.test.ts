import assert from "node:assert/strict";
import test from "node:test";
import {
  useForMarkdownInWorkspace,
  withMarkdownWorkshop,
} from "../../../src/plugins/editor/associations";
import { fakeHost } from "../../support/vscode-fake";

test("Markdown patterns route to this editor; other associations stay", () => {
  assert.deepEqual(
    withMarkdownWorkshop({ "*.pdf": "pdf.preview", "*.md": "default" }),
    {
      "*.pdf": "pdf.preview",
      "*.md": "markdownWorkshop.editor",
      "*.markdown": "markdownWorkshop.editor",
    },
  );
  for (const malformed of [undefined, null, [], "x", { "*.txt": 3 }]) {
    assert.deepEqual(withMarkdownWorkshop(malformed), {
      "*.md": "markdownWorkshop.editor",
      "*.markdown": "markdownWorkshop.editor",
    });
  }
});

function harness(initial: unknown) {
  let value = initial;
  const writes: unknown[] = [];
  const messages: string[] = [];
  const errors: string[] = [];
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
  });
  return { host, writes, messages, errors };
}

test("the workspace command writes the workspace associations once", async () => {
  const h = harness({ "*.pdf": "pdf.preview" });
  await useForMarkdownInWorkspace(h.host);
  assert.deepEqual(h.writes, [
    {
      "*.pdf": "pdf.preview",
      "*.md": "markdownWorkshop.editor",
      "*.markdown": "markdownWorkshop.editor",
    },
  ]);
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
