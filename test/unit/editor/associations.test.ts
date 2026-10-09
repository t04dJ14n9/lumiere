import assert from "node:assert/strict";
import test from "node:test";
import {
  useForMarkdownInWorkspace,
  withMarkdownWorkbench,
} from "../../../src/plugins/editor/associations";
import { fakeWorkbench } from "../../support/vscode-fake";

test("Markdown patterns route to this editor; other associations stay", () => {
  assert.deepEqual(
    withMarkdownWorkbench({ "*.pdf": "pdf.preview", "*.md": "default" }),
    {
      "*.pdf": "pdf.preview",
      "*.md": "markdownWorkbench.editor",
      "*.markdown": "markdownWorkbench.editor",
    },
  );
  for (const malformed of [undefined, null, [], "x", { "*.txt": 3 }]) {
    assert.deepEqual(withMarkdownWorkbench(malformed), {
      "*.md": "markdownWorkbench.editor",
      "*.markdown": "markdownWorkbench.editor",
    });
  }
});

function harness(initial: unknown, available = true) {
  let value = initial;
  const writes: unknown[] = [];
  const messages: string[] = [];
  const errors: string[] = [];
  const workbench = fakeWorkbench({
    error: (message) => errors.push(message),
    inform: (message) => messages.push(message),
    ...(available
      ? {
          editorAssociations: {
            read: () => value,
            write: async (next) => {
              writes.push(next);
              value = next;
            },
          },
        }
      : {}),
  });
  return { workbench, writes, messages, errors };
}

test("the workspace command writes the workspace associations once", async () => {
  const h = harness({ "*.pdf": "pdf.preview" });
  await useForMarkdownInWorkspace(h.workbench);
  assert.deepEqual(h.writes, [
    {
      "*.pdf": "pdf.preview",
      "*.md": "markdownWorkbench.editor",
      "*.markdown": "markdownWorkbench.editor",
    },
  ]);
  await useForMarkdownInWorkspace(h.workbench);
  assert.equal(h.writes.length, 1, "an existing association is not rewritten");
  assert.equal(h.messages.length, 2);
  assert.match(h.messages[1]!, /already/);
  assert.deepEqual(h.errors, []);
});

test("without a workspace there is nothing to write", async () => {
  for (const h of [harness(undefined), harness({}, false)]) {
    await useForMarkdownInWorkspace(h.workbench);
    assert.deepEqual(h.writes, []);
    assert.equal(h.errors.length, 1);
  }
});
