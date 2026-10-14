import test from "node:test";
import assert from "node:assert/strict";
import { planResourceOpen } from "../../../src/markdown/okf/authorize";

const documentPath = "bundle/notes/source.md";
const bundleRoot = "bundle";

test("http and https resources are external opens", () => {
  assert.deepEqual(
    planResourceOpen({
      resource: "https://example.com/paper",
      documentPath,
      bundleRoot,
    }),
    { action: "external", url: "https://example.com/paper" },
  );
  assert.equal(
    planResourceOpen({
      resource: "http://example.com/a",
      documentPath,
      bundleRoot,
    }).action,
    "external",
  );
});

test("command, javascript and data URLs are rejected", () => {
  for (const resource of [
    "command:workbench.action.reloadWindow",
    "javascript:alert(1)",
    "data:text/html,hi",
  ]) {
    const plan = planResourceOpen({ resource, documentPath, bundleRoot });
    assert.equal(plan.action, "refuse", resource);
  }
});

test("scope descriptions stay plain text and are not navigable", () => {
  assert.deepEqual(
    planResourceOpen({
      resource: "Q3 board discussion",
      documentPath,
      bundleRoot,
    }),
    { action: "text" },
  );
});

test("a bundle-absolute path stays inside the bundle", () => {
  assert.deepEqual(
    planResourceOpen({
      resource: "/metrics/topic.md",
      documentPath,
      bundleRoot,
    }),
    { action: "workspace", path: "bundle/metrics/topic.md" },
  );
});

test("a path that escapes the vault is refused", () => {
  assert.equal(
    planResourceOpen({
      resource: "../../../secrets.md",
      documentPath,
      bundleRoot,
    }).action,
    "refuse",
  );
});
