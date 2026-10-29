import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { OutsideWorkspace } from "@workshop/host-node/core";
import { MemoryFileSystem } from "../../src/memory-fs";
import { Mounts } from "../../src/mounts";

const ROOT = "/vaults/Notes";
const uri = (path: string) => pathToFileURL(`${ROOT}/${path}`).href;

function mounted() {
  const files = new Mounts();
  files.mount(
    ROOT,
    new MemoryFileSystem({
      "Welcome.md": "# Welcome",
      "daily/Today.md": "# Today",
    }),
  );
  return files;
}

test("files in a mounted folder are read, listed and stat'ed by URI", async () => {
  const files = mounted();
  assert.equal(await files.readText(uri("Welcome.md")), "# Welcome");
  assert.deepEqual(
    (await files.list(pathToFileURL(ROOT).href))?.map((entry) => [
      entry.name,
      entry.kind,
    ]),
    [
      ["Welcome.md", "file"],
      ["daily", "folder"],
    ],
  );
  assert.equal((await files.stat(uri("daily")))?.kind, "folder");
  assert.equal((await files.stat(uri("daily/Today.md")))?.size, 7);
  assert.equal(await files.stat(uri("Missing.md")), undefined);
  await assert.rejects(files.readText(uri("Missing.md")), {
    code: "FileNotFound",
  });
  await assert.rejects(files.readText(pathToFileURL("/elsewhere/x.md").href), {
    code: "FileNotFound",
  });
});

test("a file is a Blob, read as it is used where its folder can, else whole", async () => {
  const files = mounted();
  const whole = await files.readBlob(uri("Welcome.md"));
  assert.equal(await whole.text(), "# Welcome");
  await assert.rejects(files.readBlob(uri("Missing.md")), {
    code: "FileNotFound",
  });
  const video = new Blob([new Uint8Array(1000)], { type: "video/webm" });
  const lazy = new MemoryFileSystem();
  let reads = 0;
  files.mount(
    "/vaults/Videos",
    Object.assign(lazy, {
      read: async () => {
        reads++;
        return new Uint8Array();
      },
      readBlob: async (path: string) =>
        path === "clip.webm" ? video : Promise.reject(new Error(path)),
    }),
  );
  assert.equal(
    await files.readBlob(pathToFileURL("/vaults/Videos/clip.webm").href),
    video,
  );
  assert.equal(reads, 0, "the folder's own Blob, not a read of the file");
});

test("saving needs an existing file, creating never overwrites, and watchers hear both", async () => {
  const files = mounted();
  const heard: string[] = [];
  const stopFile = files.watch(uri("New.md"), () => heard.push("file"));
  const stopTree = files.watchTree(pathToFileURL(ROOT).href, (relative) =>
    heard.push(`tree:${relative}`),
  );
  await assert.rejects(files.save(uri("New.md"), "x"), {
    code: "FileNotFound",
  });
  await files.create(uri("New.md"));
  await files.save(uri("New.md"), "# New");
  await files.create(uri("New.md"));
  assert.equal(await files.readText(uri("New.md")), "# New");
  stopFile();
  stopTree();
  await files.save(uri("New.md"), "unheard");
  assert.deepEqual(heard, [
    "file",
    "tree:New.md",
    "file",
    "tree:New.md",
    "file",
    "tree:New.md",
  ]);
});

test("folders are made, files moved and copied, and removed", async () => {
  const files = mounted();
  await files.mkdir(uri("a/b"));
  await files.copy(uri("daily"), uri("a/b/daily"));
  assert.equal(await files.readText(uri("a/b/daily/Today.md")), "# Today");
  await files.move(uri("Welcome.md"), uri("a/Welcome.md"));
  assert.equal(await files.stat(uri("Welcome.md")), undefined);
  assert.equal(await files.readText(uri("a/Welcome.md")), "# Welcome");
  await files.remove(uri("a/Welcome.md"));
  await files.remove(uri("a/Welcome.md"));
  assert.equal(await files.stat(uri("a/Welcome.md")), undefined);
});

test("containment is by path: dot segments resolve, hidden separators are refused", async () => {
  const files = mounted();
  const root = pathToFileURL(ROOT).href;
  assert.equal(files.isInside(root, uri("daily/Today.md")), true);
  assert.equal(files.isInside(root, `${root}/../Other/x.md`), false);
  assert.equal(
    files.isInside(root, `${root}/daily%2F..%2F..%2FOther%2Fx.md`),
    false,
  );
  assert.equal(
    files.isInside(root, pathToFileURL("/vaults/Notes-old/x.md").href),
    false,
  );
  await files.contain(root, uri("New/Note.md"));
  await assert.rejects(
    files.contain(root, `${root}/../x.md`),
    OutsideWorkspace,
  );
});

test("URIs are written as Node writes them, so equal files compare equal", () => {
  const files = mounted();
  for (const path of ["/v/a b.md", "/v/Paper [draft] ~ 100%.md", "/v/é#?.md"]) {
    assert.equal(files.uriOf(path), pathToFileURL(path).href);
    assert.equal(files.toPath(files.uriOf(path)), path);
  }
});

test("a memory folder reports every change, and starts again from what it reported", async () => {
  const kept = new Map<string, unknown>();
  const files = new MemoryFileSystem({}, (path, entry) =>
    entry ? kept.set(path, entry) : kept.delete(path),
  );
  await files.mkdir("daily");
  await files.write(
    "daily/Today.md",
    new TextEncoder().encode("# Today"),
    "create",
  );
  await files.move("daily", "journal");
  await files.write("Gone.md", new Uint8Array(), "create");
  await files.remove("Gone.md");
  await files.write("Kept.md", new TextEncoder().encode("one"), "create");
  await files.write("Kept.md", new TextEncoder().encode("two"), "replace");
  assert.deepEqual([...kept.keys()].sort(), [
    "Kept.md",
    "journal",
    "journal/Today.md",
  ]);
  const again = new MemoryFileSystem(kept as never);
  assert.equal(
    new TextDecoder().decode(await again.read("journal/Today.md")),
    "# Today",
  );
  assert.equal(new TextDecoder().decode(await again.read("Kept.md")), "two");
});
