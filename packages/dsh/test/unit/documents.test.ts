import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { diskReadReplacesNote, NoteDocuments } from "../../src/host/documents";

async function note(text: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "lumiere-dsh-"));
  const file = path.join(dir, "Note.md");
  await writeFile(file, text);
  return {
    file,
    uri: pathToFileURL(file).toString(),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

const until = async (check: () => Promise<boolean> | boolean) => {
  for (let i = 0; i < 100; i++) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("condition never held");
};

test("edits apply in LF offsets over CRLF text, report source offsets and write after a pause", async (t) => {
  const { file, uri, cleanup } = await note("a\r\nb\r\nc");
  const documents = new NoteDocuments(10);
  t.after(() => documents.dispose());
  t.after(cleanup);
  const document = await documents.open(uri);
  const changes: unknown[] = [];
  documents.onChange((_document, edits) => changes.push(edits));

  // "b" is offset 2 in the LF text and 3 in the CRLF source.
  assert.equal(
    await documents.apply(document, [
      { from: 2, to: 3, insert: "B" },
      { from: 0, to: 1, insert: "A" },
    ]),
    true,
  );
  assert.equal(document.getText(), "A\r\nB\r\nc");
  assert.equal(document.version, 2);
  assert.equal(document.isDirty, true);
  assert.deepEqual(changes, [
    [
      { from: 3, to: 4, insert: "B" },
      { from: 0, to: 1, insert: "A" },
    ],
  ]);
  await until(async () => (await readFile(file, "utf8")) === "A\r\nB\r\nc");
  assert.equal(document.isDirty, false);
});

test("pending edits flush before a save writes, and save listeners hear it", async (t) => {
  const { file, uri, cleanup } = await note("one");
  const documents = new NoteDocuments(60_000);
  t.after(() => documents.dispose());
  t.after(cleanup);
  const document = await documents.open(uri);
  documents.onWillSave(async (saving) => {
    await documents.apply(saving, [{ from: 3, to: 3, insert: " two" }]);
  });
  const saved: string[] = [];
  documents.onSave((item) => saved.push(item.getText()));
  assert.equal(await document.save(), true);
  assert.equal(await readFile(file, "utf8"), "one two");
  assert.deepEqual(saved, ["one two"]);
});

test("another program's change reloads a clean note but never unsaved typing", async (t) => {
  const { file, uri, cleanup } = await note("start");
  const documents = new NoteDocuments(60_000);
  t.after(() => documents.dispose());
  t.after(cleanup);
  const document = await documents.open(uri);
  await writeFile(file, "from outside");
  await until(() => document.getText() === "from outside");
  assert.equal(document.isDirty, false);

  await documents.apply(document, [{ from: 0, to: 0, insert: "mine: " }]);
  await writeFile(file, "outside again");
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(document.getText(), "mine: from outside");
});

test("the last panel to let go writes unsaved text and closes the note", async (t) => {
  const { file, uri, cleanup } = await note("x");
  const documents = new NoteDocuments(60_000);
  t.after(() => documents.dispose());
  t.after(cleanup);
  const closed: string[] = [];
  documents.onClosed((item) => closed.push(item));
  const document = await documents.open(uri);
  documents.retain(uri);
  documents.retain(uri);
  await documents.apply(document, [{ from: 1, to: 1, insert: "y" }]);
  await documents.release(uri);
  assert.deepEqual(closed, []);
  await documents.release(uri);
  assert.deepEqual(closed, [uri]);
  assert.equal(await readFile(file, "utf8"), "xy");
  assert.equal(documents.text(uri), undefined);
});

test("a failed write still closes every watch, so the host can exit", async (t) => {
  const { uri, cleanup } = await note("doomed");
  const documents = new NoteDocuments(60_000);
  const document = await documents.open(uri);
  await documents.apply(document, [{ from: 0, to: 0, insert: "!" }]);
  await cleanup();
  await assert.rejects(documents.dispose(), { code: "ENOENT" });
  assert.equal(documents.text(uri), undefined);
  t.diagnostic("the test process exiting proves no watch stayed open");
});

test("a disk read that overlapped a save does not undo it", () => {
  assert.equal(
    diskReadReplacesNote({
      text: "stale",
      diskText: "edited",
      dirty: false,
      open: true,
      writesAtStart: 0,
      writesNow: 1,
    }),
    false,
  );
  assert.equal(
    diskReadReplacesNote({
      text: "from outside",
      diskText: "saved",
      dirty: false,
      open: true,
      writesAtStart: 1,
      writesNow: 1,
    }),
    true,
  );
});

test("a disk read in flight during a save is dropped when it resumes", async (t) => {
  const { file, uri, cleanup } = await note("saved");
  const pending: Array<(text: string) => void> = [];
  let opened = false;
  const documents = new NoteDocuments(60_000, {
    readFile: (target) => {
      if (!opened) {
        opened = true;
        return readFile(target, "utf8");
      }
      return new Promise((resolve) => {
        pending.push(resolve);
      });
    },
  });
  t.after(() => {
    for (const resolve of pending) {
      resolve("edited");
    }
    return documents.dispose();
  });
  t.after(cleanup);
  const document = await documents.open(uri);
  await writeFile(file, "external");
  await until(() => pending.length >= 1);
  await documents.apply(document, [{ from: 0, to: 5, insert: "edited" }]);
  assert.equal(await document.save(), true);
  pending[0]!("stale");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(document.getText(), "edited");
  assert.equal(await readFile(file, "utf8"), "edited");
});

test("opening a note twice at once returns one document", async (t) => {
  const { uri, cleanup } = await note("same");
  const documents = new NoteDocuments();
  t.after(() => documents.dispose());
  t.after(cleanup);
  const [a, b] = await Promise.all([documents.open(uri), documents.open(uri)]);
  assert.equal(a, b);
});
