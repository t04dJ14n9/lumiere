import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createEmptyFile,
  resolveContainedNote,
  writeThroughFile,
  assertContained,
} from "../../src/host/paths";

async function directory(t: test.TestContext, prefix: string) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("a note opens only when its real path stays inside the workspace", async (t) => {
  const root = await directory(t, "lumiere-root-");
  const outside = await directory(t, "lumiere-out-");
  const note = path.join(root, "Note.md");
  await writeFile(note, "hello");
  await symlink(path.join(outside, "secret"), path.join(root, "link.md"));
  await writeFile(path.join(outside, "secret"), "no");

  const opened = await resolveContainedNote(note, root);
  assert.equal(opened?.note, note);
  assert.equal(opened?.root, root);
  assert.equal(await resolveContainedNote(note, "/"), undefined);
  assert.equal(
    await resolveContainedNote(path.join(root, "link.md"), root),
    undefined,
  );
  await assert.rejects(
    assertContained(
      pathToFileURL(root).toString(),
      pathToFileURL(path.join(root, "link.md")).toString(),
    ),
  );
});

test("writing does not follow a symlink, and creating does not truncate", async (t) => {
  const root = await directory(t, "lumiere-write-");
  const outside = await directory(t, "lumiere-target-");
  const secret = path.join(outside, "secret");
  await writeFile(secret, "keep");
  const link = path.join(root, "link.md");
  await symlink(secret, link);
  await assert.rejects(writeThroughFile(link, "changed"));
  assert.equal(await readFile(secret, "utf8"), "keep");

  const file = path.join(root, "New.md");
  await writeFile(file, "keep");
  await createEmptyFile(file);
  assert.equal(await readFile(file, "utf8"), "keep");
});
