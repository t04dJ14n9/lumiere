import test from "node:test";
import assert from "node:assert/strict";
import { formatMarkdownAgentReference } from "../../../src/shared/agent-reference";

test("formats exact Markdown agent references", () => {
  assert.equal(formatMarkdownAgentReference("notes/a.md", 7, 7), "@notes/a.md#7");
  assert.equal(formatMarkdownAgentReference("notes\\a.md", 7, 9), "@notes/a.md#7-9");
});

test("rejects URI schemes and all Windows drive-prefixed Markdown paths", () => {
  for (const relativePath of [
    "file:///tmp/paper.md",
    "https://example.com/paper.md",
    "C:paper.md",
    "C:/paper.md",
    "C:\\paper.md",
  ]) {
    assert.throws(
      () => formatMarkdownAgentReference(relativePath, 1, 1),
      /workspace-relative/,
      relativePath,
    );
  }
});
