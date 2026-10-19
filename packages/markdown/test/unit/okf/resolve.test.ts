import test from "node:test";
import assert from "node:assert/strict";
import { resolveOkfLink } from "../../../src/markdown/okf/resolve";

const files = new Set([
  "metrics/topic.md",
  "bundle/metrics/topic.md",
  "bundle/notes/source.md",
  "bundle/notes/sibling.md",
  "bundle/assets/figure.png",
  "other/missing.md",
]);

function find(path: string): string | undefined {
  return files.has(path) ? path : undefined;
}

test("a leading slash inside a bundle is bundle-root relative", () => {
  const hit = resolveOkfLink({
    linktext: "/metrics/topic.md",
    sourcePath: "bundle/notes/source.md",
    bundleRoot: "bundle",
    syntax: "markdown",
    find,
  });
  assert.deepEqual(hit, {
    action: "resolved",
    path: "bundle/metrics/topic.md",
  });
});

test("a leading slash does not fall through to a vault-root file of the same name", () => {
  const hit = resolveOkfLink({
    linktext: "/metrics/topic",
    sourcePath: "bundle/notes/source.md",
    bundleRoot: "bundle",
    syntax: "markdown",
    find,
  });
  assert.equal(hit.action, "resolved");
  if (hit.action === "resolved") {
    assert.equal(hit.path, "bundle/metrics/topic.md");
  }
});

test("an explicit missing OKF path does not basename-fallback", () => {
  const hit = resolveOkfLink({
    linktext: "/metrics/missing.md",
    sourcePath: "bundle/notes/source.md",
    bundleRoot: "bundle",
    syntax: "markdown",
    find,
  });
  assert.deepEqual(hit, { action: "unresolved" });
});

test("an ordinary relative link is source-file relative", () => {
  const hit = resolveOkfLink({
    linktext: "sibling.md",
    sourcePath: "bundle/notes/source.md",
    bundleRoot: "bundle",
    syntax: "markdown",
    find,
  });
  assert.deepEqual(hit, {
    action: "resolved",
    path: "bundle/notes/sibling.md",
  });
});

test("a relative link that leaves the vault is unresolved", () => {
  const hit = resolveOkfLink({
    linktext: "../../outside.md",
    sourcePath: "bundle/notes/source.md",
    bundleRoot: "bundle",
    syntax: "markdown",
    find,
  });
  assert.deepEqual(hit, { action: "unresolved" });
});

test("wikilinks keep vault compatibility outside the OKF rule", () => {
  const hit = resolveOkfLink({
    linktext: "topic",
    sourcePath: "bundle/notes/source.md",
    bundleRoot: "bundle",
    syntax: "wikilink",
    find,
  });
  assert.deepEqual(hit, { action: "passthrough" });
});

test("markdown without an extension does not fall through to a vault-root file", () => {
  const hit = resolveOkfLink({
    linktext: "metrics/topic",
    sourcePath: "bundle/notes/source.md",
    bundleRoot: "bundle",
    syntax: "markdown",
    find,
  });
  assert.deepEqual(hit, { action: "unresolved" });
});

test("a wikilink keeps vault rules even when it names a markdown extension", () => {
  const hit = resolveOkfLink({
    linktext: "topic.md",
    sourcePath: "bundle/notes/source.md",
    bundleRoot: "bundle",
    syntax: "wikilink",
    find,
  });
  assert.deepEqual(hit, { action: "passthrough" });
});

test("outside an OKF bundle the resolver does not change vault rules", () => {
  const hit = resolveOkfLink({
    linktext: "/metrics/topic.md",
    sourcePath: "readme.md",
    bundleRoot: undefined,
    syntax: "markdown",
    find,
  });
  assert.deepEqual(hit, { action: "passthrough" });
});
