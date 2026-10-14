import test from "node:test";
import assert from "node:assert/strict";
import { metadata } from "../../../src/markdown/metadata";
import { okfLinkPolicy } from "../../../src/plugins/okfCore/policy";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";
import { rewriteLinks } from "../../../src/plugins/linkUpdates/rewrite";

function index() {
  const vault = new MemoryVaultIndex({
    root: "file:///vault",
    folderNote: "",
    linkFormat: "shortest",
  });
  vault.replaceFiles(
    [
      "metrics/topic.md",
      "bundle/index.md",
      "bundle/metrics/topic.md",
      "bundle/notes/source.md",
      "other/missing.md",
    ].map((path) => ({
      uri: `file:///vault/${path}`,
      path,
      mtime: 1,
      size: 1,
    })),
  );
  vault.setMetadata(
    "bundle/notes/source.md",
    metadata(
      "See [topic](/metrics/topic.md) and [gone](/metrics/missing.md) and [[topic]].",
    ),
  );
  return vault;
}

test("an OKF policy resolves bundle-absolute links and drops basename fallback", () => {
  const vault = index();
  assert.equal(
    vault.resolveLink("/metrics/topic.md", "bundle/notes/source.md")?.path,
    "metrics/topic.md",
  );
  vault.setLinkPolicies([okfLinkPolicy(() => ["bundle"])]);
  assert.equal(
    vault.resolveLink("/metrics/topic.md", "bundle/notes/source.md")?.path,
    "bundle/metrics/topic.md",
  );
  assert.equal(
    vault.resolveLink("/metrics/missing.md", "bundle/notes/source.md"),
    undefined,
  );
  assert.equal(
    vault.unresolvedLinks("bundle/notes/source.md").has("/metrics/missing.md"),
    true,
  );
  assert.equal(
    vault.resolveLink("topic", "bundle/notes/source.md")?.path,
    "bundle/metrics/topic.md",
  );
  assert.equal(
    vault.describeLink("bundle/metrics/topic.md", "bundle/notes/source.md"),
    "/metrics/topic",
  );
});

test("removing the policy invalidates resolution back to vault rules", () => {
  const vault = index();
  vault.setLinkPolicies([okfLinkPolicy(() => ["bundle"])]);
  vault.setLinkPolicies([]);
  assert.equal(
    vault.resolveLink("/metrics/topic.md", "bundle/notes/source.md")?.path,
    "metrics/topic.md",
  );
  assert.equal(
    vault.describeLink("bundle/metrics/topic.md", "bundle/notes/source.md"),
    undefined,
  );
});

test("link rewrites prefer the policy's bundle-absolute text", () => {
  const edits = rewriteLinks(
    "See [topic](/metrics/topic.md).",
    "bundle/notes/source.md",
    {
      renames: new Map([
        ["bundle/metrics/topic.md", "bundle/metrics/renamed.md"],
      ]),
      resolve: () => "bundle/metrics/topic.md",
      pathsAfter: ["bundle/metrics/renamed.md"],
      format: "shortest",
      preferredText: () => "/metrics/renamed",
    },
  );
  assert.equal(edits[0]?.text, "[topic](/metrics/renamed.md)");
});
