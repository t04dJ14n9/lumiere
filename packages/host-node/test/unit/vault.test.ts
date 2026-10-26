import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { nodeFiles } from "../../src/host/node-platform";
import { isInside } from "../../src/host/paths";
import { listVault, watchVault } from "../../src/host/vault";
import type { FileEvent } from "@workshop/markdown/portable";

async function vault(t: test.TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), "lumiere-vault-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, "notes"));
  await mkdir(path.join(dir, ".obsidian"));
  await mkdir(path.join(dir, "node_modules"));
  await writeFile(path.join(dir, "Home.md"), "# Home");
  await writeFile(path.join(dir, "notes", "A note.md"), "a");
  await writeFile(path.join(dir, ".obsidian", "app.json"), "{}");
  await writeFile(path.join(dir, "node_modules", "x.md"), "x");
  return { dir, root: pathToFileURL(dir).toString() };
}

test("listing walks the vault but not hidden folders or node_modules, and stops at the limit", async (t) => {
  const { root } = await vault(t);
  const all = await listVault(nodeFiles, { root, limit: 100 });
  assert.deepEqual(all.files.map((file) => file.path).sort(), [
    "Home.md",
    "notes/A note.md",
  ]);
  assert.equal(all.partial, false);
  assert.ok(all.files.every((file) => file.uri.startsWith("file://")));
  const shallow = await listVault(nodeFiles, {
    root,
    limit: 100,
    shallow: true,
  });
  assert.deepEqual(
    shallow.files.map((file) => file.path),
    ["Home.md"],
  );
  const limited = await listVault(nodeFiles, { root, limit: 1 });
  assert.equal(limited.files.length, 1);
  assert.equal(limited.partial, true);
});

test("watching reports a new file, a change to it and its deletion, never hidden files", async (t) => {
  const { dir, root } = await vault(t);
  const events: FileEvent[] = [];
  const stop = watchVault(nodeFiles, root, (event) => events.push(event));
  t.after(stop);
  // macOS starts delivering events a moment after the watch begins.
  await new Promise((resolve) => setTimeout(resolve, 400));
  const file = path.join(dir, "notes", "New.md");
  await writeFile(file, "one");
  await writeFile(path.join(dir, ".obsidian", "app.json"), "{ }");
  await waitFor(() => events.some((event) => event.type === "create"));
  // macOS merges events on one path that come close together.
  await new Promise((resolve) => setTimeout(resolve, 300));
  await writeFile(file, "one two");
  await waitFor(() =>
    events.some((event) => event.type === "change" && event.file.size === 7),
  );
  await unlink(file);
  await waitFor(() => events.some((event) => event.type === "delete"));
  // macOS may also report files made just before the watch began.
  const paths = events.map((event) =>
    event.type === "delete" ? event.path : event.file.path,
  );
  assert.ok(
    paths.every(
      (item) => !item.startsWith(".") && !item.includes("node_modules"),
    ),
    String(paths),
  );
});

test("a URI is inside a root only at a path boundary, after dot segments resolve", () => {
  assert.equal(isInside("file:///v", "file:///v/a.md"), true);
  assert.equal(isInside("file:///v/", "file:///v/a.md"), true);
  assert.equal(isInside("file:///v", "file:///v"), true);
  assert.equal(isInside("file:///v", "file:///v/..secret"), true);
  assert.equal(isInside("file:///v", "file:///vault/a.md"), false);
  assert.equal(isInside("file:///v", "file:///v/../etc/passwd"), false);
  assert.equal(isInside("file:///v", "file:///v/%2e%2e/etc/passwd"), false);
  assert.equal(isInside("file:///v", "file:///v/foo%2f..%2fetc/passwd"), false);
});

async function waitFor(check: () => boolean): Promise<void> {
  for (let i = 0; i < 150; i++) {
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("the expected event never came");
}
