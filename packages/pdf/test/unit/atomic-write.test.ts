import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { writeAtomicFile } from "../../src/shared/atomic-write";

test("writeAtomicFile replaces target and returns sha256", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lumiere-pdf-atomic-"));
  const target = path.join(dir, "doc.pdf");
  await writeFile(target, Buffer.from("%PDF-old"));
  const next = Buffer.from("%PDF-annotated-bytes");
  const { sha256 } = await writeAtomicFile(target, next);
  assert.equal(sha256, createHash("sha256").update(next).digest("hex"));
  assert.equal(await readFile(target, "utf8"), "%PDF-annotated-bytes");
  assert.deepEqual(await readdir(dir), ["doc.pdf"]);
});

test("writeAtomicFile rejects when directory is missing", async () => {
  await assert.rejects(() =>
    writeAtomicFile(path.join("/no/such/dir", "x.pdf"), Buffer.from("x")),
  );
});
