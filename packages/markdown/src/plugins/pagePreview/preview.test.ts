import test from "node:test";
import assert from "node:assert/strict";
import { canPreview } from "./controller";
test("page previews load only internal targets and fragments", () => {
  for (const href of ["Note", "../Folder/Note.md#Heading", "#^block"]) {
    assert.equal(canPreview(href), true);
  }
  for (const href of [
    "",
    "https://example.com",
    "//example.com",
    "data:text/html,x",
    "vscode://extension/path",
  ]) {
    assert.equal(canPreview(href), false);
  }
});

test("note previews retain source offsets and disable embedded task edits", async () => {
  const { notePreview } = await import("./content");
  const source = "# First\nA\n\n# Second\n- [ ] task\n";
  const preview = notePreview(source, "Note#Second", "file:///vault/Note.md");
  assert.equal(preview.context.sourceLine, 3);
  assert.equal(preview.context.documentText, source);
  assert.equal(preview.context.documentUri, "file:///vault/Note.md");
  assert.equal(preview.context.taskLineCount, 0);
  assert.deepEqual(preview.context.ancestry, ["file:///vault/Note.md#Second"]);
  assert.match(preview.text, /# Second\n- \[ \] task/);
  assert.throws(
    () => notePreview(source, "Note#missing", "Note"),
    /Section not found/,
  );
});

test("preview labels decode valid escapes and preserve malformed targets", async () => {
  const { previewLabel } = await import("./popup");
  assert.equal(previewLabel("My%20Note#Heading"), "My Note#Heading");
  assert.equal(previewLabel("%E0%A4%A"), "%E0%A4%A");
});
