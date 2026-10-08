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
