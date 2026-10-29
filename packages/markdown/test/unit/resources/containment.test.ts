import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  contains,
  containedResource,
} from "../../../src/plugins/resources/containment";
import { realContains } from "../../../src/host/real-contains";
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
      { realContains },
    );
    await assert.rejects(
      containedResource(
        pathToFileURL(temp + "/vault").href,
        pathToFileURL(temp + "/vault/escape.md").href,
        true,
        { realContains },
      ),
      /symlink escapes/,
    );
    // Without real paths (a browser host), any link is refused.
    await assert.rejects(
      containedResource(
        pathToFileURL(temp + "/vault").href,
        pathToFileURL(temp + "/vault/escape.md").href,
        true,
      ),
      /Virtual symbolic/,
    );
    await assert.rejects(
      containedResource(
        "vscode-remote://host/vault",
        "vscode-remote://host/vault/file",
        true,
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

test("resource containment resolves dot segments as path.posix.relative does", async () => {
  const { relative } = await import("node:path/posix");
  for (const [root, uri] of [
    ["file:///vault", "file:///vault/a/../b.md"],
    ["file:///vault/", "file:///vault/./b.md"],
    ["file:///vault", "file:///vault//b.md"],
    ["file:///vault", "file:///vaults/b.md"],
    ["file:///vault/sub", "file:///vault/sub/../../vault/sub/x"],
    ["file:///vault/sub", "file:///vault/x/../sub"],
    ["file:///", "file:///anything/at/all"],
  ] as const) {
    const base = decodeURIComponent(new URL(root).pathname).replace(/\/$/, "");
    const rel = relative(
      base || "/",
      decodeURIComponent(new URL(uri).pathname),
    );
    const expected = !rel.startsWith("../") && rel !== "..";
    assert.equal(contains(root, uri), expected, `${root} ${uri}`);
  }
});
