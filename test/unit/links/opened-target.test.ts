import test from "node:test";
import assert from "node:assert/strict";
import { openedVaultTarget } from "../../../src/plugins/links/target";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";

test("unclaimed markdown leaves a conflicting vault-root twin for navigation", () => {
  const vault = new MemoryVaultIndex({
    root: "file:///vault",
    folderNote: "",
    linkFormat: "shortest",
  });
  vault.replaceFiles(
    ["topic.md", "notes/topic.md", "notes/source.md"].map((path) => ({
      uri: `file:///vault/${path}`,
      path,
      mtime: 1,
      size: 1,
    })),
  );
  // Index-first lookup would prefer the root twin; Markdown must not.
  assert.equal(
    vault.resolveLink("topic.md", "notes/source.md", "markdown")?.path,
    "topic.md",
  );
  const target = openedVaultTarget(vault, "topic.md", "notes/source.md", false);
  assert.deepEqual(target, { uri: undefined, passthrough: true });
  const wiki = openedVaultTarget(vault, "topic.md", "notes/source.md", true);
  assert.equal(wiki.uri, "file:///vault/topic.md");
  assert.equal(wiki.passthrough, true);
});
