import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { Vaults, type VaultEvent } from "../../src/server/vaults";

async function scratch(t: test.TestContext): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "lumiere-vaults-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("opening a vault announces it once and remembers it, newest first", async (t) => {
  const dir = await scratch(t);
  await mkdir(path.join(dir, "a"));
  await mkdir(path.join(dir, "b"));
  const vaults = new Vaults(path.join(dir, "data", "vaults.json"));
  await vaults.load();
  const events: VaultEvent[] = [];
  vaults.onEvent((event) => events.push(event));

  await vaults.add(path.join(dir, "a"));
  await vaults.add(path.join(dir, "b"));
  await vaults.add(path.join(dir, "a"));
  assert.deepEqual(vaults.list().open, [
    path.join(dir, "a"),
    path.join(dir, "b"),
  ]);
  assert.deepEqual(vaults.list().recent, [
    path.join(dir, "a"),
    path.join(dir, "b"),
  ]);
  assert.equal(events.length, 2);

  const again = new Vaults(path.join(dir, "data", "vaults.json"));
  await again.load();
  assert.deepEqual(again.list(), {
    open: [],
    recent: [path.join(dir, "a"), path.join(dir, "b")],
  });
});

test("only existing absolute folders open as vaults", async (t) => {
  const dir = await scratch(t);
  await writeFile(path.join(dir, "note.md"), "# hi");
  const vaults = new Vaults(path.join(dir, "vaults.json"));
  await assert.rejects(vaults.add("relative/folder"));
  await assert.rejects(vaults.add(path.join(dir, "missing")));
  await assert.rejects(vaults.add(path.join(dir, "note.md")));
  await assert.rejects(vaults.files(dir), /Not an open vault/);
});

test("a corrupt list of recent vaults reads as empty", async (t) => {
  const dir = await scratch(t);
  await writeFile(path.join(dir, "vaults.json"), "{not json");
  const vaults = new Vaults(path.join(dir, "vaults.json"));
  await vaults.load();
  assert.deepEqual(vaults.list().recent, []);
});

test("showing a file opens it in the vault that holds it, or in its own folder", async (t) => {
  const dir = await scratch(t);
  await mkdir(path.join(dir, "vault", "sub"), { recursive: true });
  await mkdir(path.join(dir, "loose"));
  await writeFile(path.join(dir, "vault", "sub", "n.md"), "");
  await writeFile(path.join(dir, "loose", "x.md"), "");
  const vaults = new Vaults(path.join(dir, "vaults.json"));
  await vaults.add(path.join(dir, "vault"));
  const events: VaultEvent[] = [];
  vaults.onEvent((event) => events.push(event));

  await vaults.show(path.join(dir, "vault", "sub", "n.md"));
  assert.deepEqual(events.at(-1), {
    type: "open",
    vault: path.join(dir, "vault"),
    path: "sub/n.md",
  });
  await vaults.show(path.join(dir, "loose", "x.md"));
  assert.deepEqual(events.at(-1), {
    type: "open",
    vault: path.join(dir, "loose"),
    path: "x.md",
  });
  assert.equal(vaults.holding(path.join(dir, "vault2", "n.md")), undefined);
  assert.ok(JSON.parse(await readFile(path.join(dir, "vaults.json"), "utf8")));
});

test("a vault's files are listed by kind, sorted by path", async (t) => {
  const dir = await scratch(t);
  await mkdir(path.join(dir, "b"));
  await writeFile(path.join(dir, "b", "z.md"), "");
  await writeFile(path.join(dir, "a.pdf"), "");
  await writeFile(path.join(dir, "pic.PNG"), "");
  await writeFile(path.join(dir, "data.csv"), "");
  const vaults = new Vaults(
    path.join(dir, "..", `${path.basename(dir)}-vaults.json`),
  );
  t.after(() =>
    rm(path.join(dir, "..", `${path.basename(dir)}-vaults.json`), {
      force: true,
    }),
  );
  await vaults.add(dir);
  assert.deepEqual(await vaults.files(dir), [
    { path: "a.pdf", kind: "pdf" },
    { path: "b/z.md", kind: "note" },
    { path: "data.csv", kind: "other" },
    { path: "pic.PNG", kind: "image" },
  ]);
});
