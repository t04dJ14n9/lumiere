import assert from "node:assert/strict";
import test from "node:test";
import { mergeEditorAssociations } from "../../../src/host/editor-association-merge";

test("editor associations merge user, workspace, then folder", () => {
  assert.deepEqual(
    mergeEditorAssociations([
      { "*.md": "lumiere.markdown.editor", "*.pdf": "pdf.preview", "*.txt": 3 },
      { "*.md": "default" },
      undefined,
    ]),
    { "*.md": "default", "*.pdf": "pdf.preview" },
  );
  assert.deepEqual(mergeEditorAssociations([undefined, null, []]), {});
});
