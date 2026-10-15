import test from "node:test";
import assert from "node:assert/strict";
import { detectBundles } from "../../../src/markdown/okf/bundles";
import { owningBundle } from "../../../src/markdown/okf/paths";

const files = [
  { path: "readme.md", markdown: true },
  { path: "bundle/index.md", markdown: true },
  { path: "bundle/metrics/topic.md", markdown: true, type: "metric" },
  { path: "bundle/log.md", markdown: true, type: "log" },
  { path: "bundle/nested/index.md", markdown: true },
  { path: "bundle/nested/item.md", markdown: true, type: "concept" },
  { path: "notes/index.md", markdown: true },
  { path: "loose/plain.md", markdown: true },
];

test("a folder with index.md and a typed concept is a bundle; a bare index is not", () => {
  assert.deepEqual(detectBundles(files, []), ["bundle", "bundle/nested"]);
});

test("manual bundle roots are included even without typed concepts", () => {
  assert.deepEqual(detectBundles(files, ["loose"]), [
    "bundle",
    "bundle/nested",
    "loose",
  ]);
});

test("the owning bundle is the innermost root, never a silent vault default", () => {
  const bundles = detectBundles(files, []);
  assert.equal(owningBundle(bundles, "bundle/nested/item.md"), "bundle/nested");
  assert.equal(owningBundle(bundles, "bundle/metrics/topic.md"), "bundle");
  assert.equal(owningBundle(bundles, "readme.md"), undefined);
});
