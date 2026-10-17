import test from "node:test";
import assert from "node:assert/strict";
import { metadata } from "../../../src/markdown/metadata";
import { okfLinkPolicy } from "../../../src/plugins/okfCore/policy";
import { NoteResources } from "../../../src/plugins/resources/note-resources";
import type { VaultIndex } from "../../../src/plugins/vault/api";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";
import type { LinkSyntax } from "../../../src/shared/vault-path";

test("markdown images resolve source-relative inside an OKF bundle", async () => {
  const root = "vscode-remote://host/vault";
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
  const seen: LinkSyntax[] = [];
  const resources = new NoteResources({
    source: `${root}/bundle/notes/source.md`,
    vault: {
      root: vault.root,
      files: () => vault.files(),
      file: (path) => vault.file(path),
      metadata: (path) => vault.metadata(path),
      resolveLink(linktext, sourcePath, syntax) {
        seen.push(syntax ?? "wikilink");
        return vault.resolveLink(linktext, sourcePath, syntax);
      },
      resolveLinkCandidates: (linktext, sourcePath, syntax) =>
        vault.resolveLinkCandidates(linktext, sourcePath, syntax),
      classifyLink: (linktext, sourcePath, syntax) =>
        vault.classifyLink(linktext, sourcePath, syntax),
      linkText: (target, sourcePath) => vault.linkText(target, sourcePath),
      describeLink: (targetPath, sourcePath) =>
        vault.describeLink(targetPath, sourcePath),
      resolvedLinks: (sourcePath) => vault.resolvedLinks(sourcePath),
      unresolvedLinks: (sourcePath) => vault.unresolvedLinks(sourcePath),
      backlinks: (targetPath) => vault.backlinks(targetPath),
      tags: () => vault.tags(),
      onDidChange: (listener) => vault.onDidChange(listener),
      onDidResolve: (listener) => vault.onDidResolve(listener),
    } satisfies VaultIndex,
    files: {
      async stat() {
        return { mtime: 1, symbolicLink: false };
      },
      async read() {
        return new Uint8Array();
      },
    },
    resourceUrl: (uri) => uri,
  });
  // Wikilink default would prefer vault-root image.png.
  assert.equal(
    vault.resolveLink("image.png", "bundle/notes/source.md")?.path,
    "image.png",
  );
  const markdown = await resources.load(
    "image.png",
    `${root}/bundle/notes/source.md`,
    "markdown",
  );
  assert.equal(markdown.source, `${root}/bundle/notes/image.png`);
  assert.equal(markdown.kind, "image");
  const wiki = await resources.load(
    "image.png",
    `${root}/bundle/notes/source.md`,
    "wikilink",
  );
  assert.equal(wiki.source, `${root}/image.png`);
  assert.deepEqual(seen, ["markdown", "wikilink"]);
});
