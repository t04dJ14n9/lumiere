import test from "node:test";
import assert from "node:assert/strict";
import { metadata } from "../../../src/markdown/metadata";
import { embedIsWiki } from "../../../src/plugins/embeds/post-process";
import { okfLinkPolicy } from "../../../src/plugins/okfCore/policy";
import { openedVaultTarget } from "../../../src/plugins/links/target";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";

test("Open image file for a Markdown embed resolves the sibling, not the vault-root twin", () => {
  const root = "file:///vault";
  const vault = new MemoryVaultIndex({
    root,
    folderNote: "",
    linkFormat: "shortest",
  });
  vault.replaceFiles(
    [
      "image.png",
      "bundle/index.md",
      "bundle/notes/source.md",
      "bundle/notes/image.png",
    ].map((path) => ({
      uri: `${root}/${path}`,
      path,
      mtime: 1,
      size: 1,
    })),
  );
  vault.setMetadata("bundle/notes/source.md", metadata("![](image.png)"));
  vault.setLinkPolicies([okfLinkPolicy(() => ["bundle"])]);

  // Markdown image markup has no data-wiki → wiki:false for Open.
  assert.equal(embedIsWiki({ dataset: {} }), false);

  // Wikilink open (the pre-fix hardcoded wiki:true) prefers the vault root.
  const wiki = openedVaultTarget(
    vault,
    "image.png",
    "bundle/notes/source.md",
    true,
  );
  assert.equal(wiki.uri, `${root}/image.png`);

  // Markdown open keeps the displayed sibling.
  const markdown = openedVaultTarget(
    vault,
    "image.png",
    "bundle/notes/source.md",
    false,
  );
  assert.equal(markdown.uri, `${root}/bundle/notes/image.png`);
  assert.equal(markdown.passthrough, false);
});
