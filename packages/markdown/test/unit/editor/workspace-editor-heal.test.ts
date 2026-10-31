import assert from "node:assert/strict";
import test from "node:test";
import { readerText } from "../../../src/host/reader-text";
import { healWorkspaceEditorAssociation } from "../../../src/host/workspace-editor-heal";
import { MARKDOWN_WORKSPACE_EDITOR_KEY } from "../../../src/shared/editor-provider";

function memento(initial: Record<string, unknown> = {}) {
  const values = new Map<string, unknown>(Object.entries(initial));
  return {
    values,
    get<T>(key: string, fallback: T) {
      return (values.has(key) ? values.get(key) : fallback) as T;
    },
    async update(key: string, value: unknown) {
      if (value === undefined) {
        values.delete(key);
      } else {
        values.set(key, value);
      }
    },
  };
}

const defaultAssociations = {
  "*.md": "default",
  "*.markdown": "default",
};

test("heal sets workspaceEditor and clears false readerText sticks", () => {
  const state = memento();
  readerText.restore(state as never);
  readerText.keep("file:///vault/Core.md");
  assert.equal(readerText.has("file:///vault/Core.md"), true);

  assert.equal(
    healWorkspaceEditorAssociation(state as never, defaultAssociations),
    true,
  );
  assert.equal(state.values.get(MARKDOWN_WORKSPACE_EDITOR_KEY), true);
  assert.equal(readerText.has("file:///vault/Core.md"), false);
});

test("heal is a no-op when workspaceEditor is already set", () => {
  const state = memento({ [MARKDOWN_WORKSPACE_EDITOR_KEY]: true });
  readerText.restore(state as never);
  readerText.keep("file:///vault/kept.md");

  assert.equal(
    healWorkspaceEditorAssociation(state as never, defaultAssociations),
    true,
  );
  assert.equal(readerText.has("file:///vault/kept.md"), true);
});

test("heal does not invent workspaceEditor without default associations", () => {
  const state = memento();
  assert.equal(
    healWorkspaceEditorAssociation(state as never, {
      "*.md": "lumiere.markdown.editor",
    }),
    false,
  );
  assert.equal(state.values.has(MARKDOWN_WORKSPACE_EDITOR_KEY), false);
  assert.equal(healWorkspaceEditorAssociation(state as never, {}), false);
});
