import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webmMime, WebmStream } from "./webm";

test("WebM metadata identifies video and audio tracks without guessing the extension", async () => {
  for (const [file, codecs] of [
    ["Motion.webm", "vp9"],
    ["Motion-vp8.webm", "vp8"],
    ["Motion-audio.webm", "vp9,opus"],
  ]) {
    const bytes = await readFile(`test/fixtures/media/${file}`);
    assert.equal(webmMime(bytes), `video/webm; codecs="${codecs}"`);
    assert.equal(webmMime(bytes.subarray(0, 20)), undefined);
  }
  assert.equal(
    webmMime(new TextEncoder().encode("not an EBML file")),
    undefined,
  );
});

test("streaming preserves unknown-size cluster boundaries and orders complete blocks", () => {
  const prefix = [0x1a, 0x45, 0xdf, 0xa3, 0x80, 0x18, 0x53, 0x80, 0x67, 0xff];
  const cluster = [0x1f, 0x43, 0xb6, 0x75, 0xff, 0xe7, 0x81, 0];
  const block = (time: number) => [0xa3, 0x85, 0x81, 0, time, 0x80, time];
  const bytes = Uint8Array.from([
    ...prefix,
    ...cluster,
    ...block(2),
    ...block(1),
    ...cluster,
    ...block(3),
  ]);
  const stream = new WebmStream();
  const chunks: Uint8Array[] = [];
  for (const byte of bytes) {
    chunks.push(...stream.push(Uint8Array.of(byte)));
  }
  chunks.push(...stream.finish());
  assert.deepEqual(
    [...Buffer.concat(chunks)],
    [...prefix, ...cluster, ...block(1), ...block(2), ...cluster, ...block(3)],
  );
});

test("WebM rejects truncated and invalid unknown-size elements", () => {
  const stream = new WebmStream();
  stream.push(Uint8Array.from([0x1a, 0x45]));
  assert.throws(() => stream.finish(), /Truncated WebM element/);
  assert.throws(
    () => new WebmStream().push(Uint8Array.from([0xe7, 0xff])),
    /Invalid unknown-size WebM element/,
  );
  const nested = [
    0x18, 0x53, 0x80, 0x67, 0xff, 0x1f, 0x43, 0xb6, 0x75, 0xff, 0xe7, 0xff,
  ];
  assert.throws(
    () => new WebmStream().push(Uint8Array.from(nested)),
    /Invalid unknown-size WebM child/,
  );
});
