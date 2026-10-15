import test from "node:test";
import assert from "node:assert/strict";
import { planResourceOpen } from "../../../src/markdown/okf/authorize";

const documentPath = "bundle/notes/source.md";
const bundleRoot = "bundle";

test("http and https resources are external opens", () => {
  for (const resource of [
    "https://example.com/paper",
    "http://example.com/a",
    "https://example.com/%E6%9A%97%E5%8C%BA.md#heading",
    "http://example.com/%E6%9A%97%E5%8C%BA.md#heading",
  ]) {
    assert.deepEqual(planResourceOpen({ resource, documentPath, bundleRoot }), {
      action: "external",
      url: resource,
    });
  }
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

test("a parent-relative resource stays inside the owning note", () => {
  assert.deepEqual(
    planResourceOpen({
      resource: "../raw/paper.pdf",
      documentPath: "bundle/concept/topic.md",
      bundleRoot: "bundle",
    }),
    { action: "workspace", path: "bundle/raw/paper.pdf" },
  );
});

test("a percent-encoded relative resource resolves to a Unicode vault path", () => {
  assert.deepEqual(
    planResourceOpen({
      resource: "../../raw/articles/%E6%9A%97%E5%8C%BA.md",
      documentPath: "knowledge/wiki/summaries/note.md",
    }),
    { action: "workspace", path: "knowledge/raw/articles/暗区.md" },
  );
});

test("an already-decoded Unicode resource resolves to the same vault path", () => {
  assert.deepEqual(
    planResourceOpen({
      resource: "../../raw/articles/暗区.md",
      documentPath: "knowledge/wiki/summaries/note.md",
    }),
    { action: "workspace", path: "knowledge/raw/articles/暗区.md" },
  );
});

test("a percent-encoded resource path preserves its fragment without decoding it", () => {
  assert.deepEqual(
    planResourceOpen({
      resource: "../../raw/articles/%E6%9A%97%E5%8C%BA.md#heading%20one",
      documentPath: "knowledge/wiki/summaries/note.md",
    }),
    {
      action: "workspace",
      path: "knowledge/raw/articles/暗区.md",
      fragment: "#heading%20one",
    },
  );
});

test("malformed percent escapes in resource paths do not throw", () => {
  for (const basename of ["%E6%9A%97%.md", "%ZZ.md"]) {
    assert.deepEqual(
      planResourceOpen({
        resource: `../raw/${basename}`,
        documentPath,
        bundleRoot,
      }),
      { action: "workspace", path: `bundle/raw/${basename}` },
    );
  }
});

test("a fragment is not part of the file lookup", () => {
  assert.deepEqual(
    planResourceOpen({
      resource: "/raw/paper.pdf#page=3",
      documentPath: "bundle/concept/topic.md",
      bundleRoot: "bundle",
    }),
    {
      action: "workspace",
      path: "bundle/raw/paper.pdf",
      fragment: "#page=3",
    },
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
