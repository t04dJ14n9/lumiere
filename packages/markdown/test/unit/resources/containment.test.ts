import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nodeRealPaths } from "@workshop/platform/node";
import {
  contains,
  containedResource,
} from "../../../src/plugins/resources/containment";
test("resource containment rejects sibling prefixes, traversal and different authorities", () => {
  assert.equal(contains("file:///vault", "file:///vault/note.md"), true);
  for (const uri of [
    "file:///vault-other/note.md",
    "file:///vault/../secret",
    "file:///vault/%2e%2e/secret",
    "file:///vault/a%2f../../secret",
    "vscode-remote://host/vault/note.md",
  ]) {
    assert.equal(contains("file:///vault", uri), false, uri);
  }
});
const onDisk = {
  realContains: (root: string, target: string) =>
    nodeRealPaths.isInside(fileURLToPath(root), fileURLToPath(target)),
};
test("realpath checks reject symlink escapes while permitting contained files", async () => {
  const temp = await mkdtemp("/tmp/mw-resources-");
  try {
    await mkdir(temp + "/vault");
    await writeFile(temp + "/vault/note.md", "note");
    await writeFile(temp + "/outside.md", "outside");
    await symlink(temp + "/outside.md", temp + "/vault/escape.md");
    await containedResource(
      pathToFileURL(temp + "/vault").href,
      pathToFileURL(temp + "/vault/note.md").href,
      false,
      onDisk,
    );
    await assert.rejects(
      containedResource(
        pathToFileURL(temp + "/vault").href,
        pathToFileURL(temp + "/vault/escape.md").href,
        true,
        onDisk,
      ),
      /symlink escapes/,
    );
    await assert.rejects(
      containedResource(
        "vscode-remote://host/vault",
        "vscode-remote://host/vault/file",
        true,
        onDisk,
      ),
      /Virtual symbolic/,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
test("virtual resource checks reject symlinked ancestor directories", async () => {
  await assert.rejects(
    containedResource(
      "vscode-remote://host/vault",
      "vscode-remote://host/vault/link/note.md",
      false,
      { inspect: async (uri) => ({ symbolicLink: uri.endsWith("/link") }) },
    ),
    /Virtual symbolic/,
  );
});
