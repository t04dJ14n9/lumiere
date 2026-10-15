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

test("markdown misses stay unresolved beside a conflicting vault-root file", () => {
  const vault = new MemoryVaultIndex({
    root: "file:///vault",
    folderNote: "",
    linkFormat: "shortest",
  });
  vault.replaceFiles(
    ["metrics/topic.md", "bundle/index.md", "bundle/notes/source.md"].map(
      (path) => ({
        uri: `file:///vault/${path}`,
        path,
        mtime: 1,
        size: 1,
      }),
    ),
  );
  vault.setMetadata(
    "bundle/notes/source.md",
    metadata("See [topic](metrics/topic) and [[topic.md]]."),
  );
  vault.setLinkPolicies([okfLinkPolicy(() => ["bundle"])]);
  assert.equal(
    vault.resolveLink("metrics/topic", "bundle/notes/source.md", "markdown"),
    undefined,
  );
  assert.equal(
    vault.unresolvedLinks("bundle/notes/source.md").has("metrics/topic"),
    true,
  );
  assert.equal(
    vault.resolveLink("topic.md", "bundle/notes/source.md", "wikilink")?.path,
    "metrics/topic.md",
  );
  assert.equal(
    vault.resolvedLinks("bundle/notes/source.md").get("metrics/topic.md"),
    1,
  );
});

test("a cross-bundle markdown move round-trips through the resolver", () => {
  const vault = new MemoryVaultIndex({
    root: "file:///vault",
    folderNote: "",
    linkFormat: "shortest",
  });
  const paths = [
    "A/index.md",
    "A/notes/source.md",
    "A/notes/topic.md",
    "A/metrics/topic.md",
    "B/topic.md",
    "metrics/topic.md",
  ];
  vault.replaceFiles(
    paths.map((path) => ({
      uri: `file:///vault/${path}`,
      path,
      mtime: 1,
      size: 1,
    })),
  );
  const text = "See [topic](../metrics/topic.md).";
  vault.setLinkPolicies([okfLinkPolicy(() => ["A", "B"])]);
  const edits = rewriteLinks(text, "A/notes/source.md", {
    renames: new Map([["A/metrics/topic.md", "B/topic.md"]]),
    resolve: (linkpath, source, syntax) =>
      vault.resolveLink(linkpath, source, syntax)?.path,
    pathsAfter: paths.map((path) =>
      path === "A/metrics/topic.md" ? "B/topic.md" : path,
    ),
    format: "shortest",
    preferredText: (target, source) => vault.describeLink(target, source),
  });
  assert.equal(edits[0]?.text, "[topic](../../B/topic.md)");
  assert.equal(
    vault.resolveLink("../../B/topic.md", "A/notes/source.md", "markdown")
      ?.path,
    "B/topic.md",
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
