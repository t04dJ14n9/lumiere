// The worker answers a file a note shows whole, or the one byte range a
// video asks for, with its media type.
import test from "node:test";
import assert from "node:assert/strict";
import { mediaType } from "../../src/worker/media-types";
import { byteRange, vaultFileResponse } from "../../src/worker/responses";

const VIDEO = new Blob([Uint8Array.from({ length: 100 }, (_, i) => i)]);
const CLIP = "file:///vaults/Notes/Attachments/clip.mp4";

async function bytes(response: Response): Promise<number[]> {
  return [...new Uint8Array(await response.arrayBuffer())];
}

test("one byte range: both ends, from a point to the end, or the last bytes", () => {
  assert.deepEqual(byteRange("bytes=0-1", 100), { start: 0, end: 1 });
  assert.deepEqual(byteRange("bytes=10-", 100), { start: 10, end: 99 });
  assert.deepEqual(byteRange("bytes=90-500", 100), { start: 90, end: 99 });
  assert.deepEqual(byteRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(byteRange("bytes=-500", 100), { start: 0, end: 99 });
});

test("a range past the end, or backwards, cannot be met", () => {
  assert.equal(byteRange("bytes=100-", 100), "unsatisfiable");
  assert.equal(byteRange("bytes=50-10", 100), "unsatisfiable");
  assert.equal(byteRange("bytes=-0", 100), "unsatisfiable");
  assert.equal(byteRange("bytes=0-", 0), "unsatisfiable");
});

test("no range, several, or one that does not parse means the whole file", () => {
  assert.equal(byteRange(null, 100), undefined);
  assert.equal(byteRange("bytes=0-1, 5-9", 100), undefined);
  assert.equal(byteRange("bytes=-", 100), undefined);
  assert.equal(byteRange("items=0-1", 100), undefined);
});

test("a whole file is 200, with its type, length and byte ranges offered", async () => {
  const response = vaultFileResponse(
    { kind: "file", file: VIDEO },
    { uri: CLIP, range: null },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.equal(response.headers.get("content-length"), "100");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await bytes(response)).length, 100);
});

test("a range is 206 with those bytes; one past the end is 416", async () => {
  const part = vaultFileResponse(
    { kind: "file", file: VIDEO },
    { uri: CLIP, range: "bytes=10-12" },
  );
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), "bytes 10-12/100");
  assert.equal(part.headers.get("content-length"), "3");
  assert.deepEqual(await bytes(part), [10, 11, 12]);
  const past = vaultFileResponse(
    { kind: "file", file: VIDEO },
    { uri: CLIP, range: "bytes=200-" },
  );
  assert.equal(past.status, 416);
  assert.equal(past.headers.get("content-range"), "bytes */100");
});

test("an SVG cannot run its scripts if it is opened as a page", () => {
  const svg = vaultFileResponse(
    { kind: "file", file: new Blob(["<svg/>"]) },
    { uri: "file:///vaults/Notes/diagram.SVG", range: null },
  );
  assert.equal(svg.headers.get("content-type"), "image/svg+xml");
  assert.match(svg.headers.get("content-security-policy") ?? "", /sandbox/);
  const png = vaultFileResponse(
    { kind: "file", file: new Blob(["png"]) },
    { uri: "file:///vaults/Notes/photo.png", range: null },
  );
  assert.equal(png.headers.get("content-security-policy"), null);
});

test("a refused file is 403; a missing one, or no answer, 404", () => {
  const request = { uri: CLIP, range: null };
  assert.equal(vaultFileResponse({ kind: "refused" }, request).status, 403);
  assert.equal(vaultFileResponse({ kind: "missing" }, request).status, 404);
  assert.equal(vaultFileResponse({ kind: "unknown" }, request).status, 404);
  assert.equal(vaultFileResponse(undefined, request).status, 404);
});

test("media types by extension; anything else is bytes", () => {
  assert.equal(mediaType("file:///v/a%20b.JPG"), "image/jpeg");
  assert.equal(mediaType("file:///v/motion.webm"), "video/webm");
  assert.equal(mediaType("file:///v/paper.pdf"), "application/pdf");
  assert.equal(mediaType("file:///v/song.m4a"), "audio/mp4");
  assert.equal(mediaType("file:///v/page.html"), "application/octet-stream");
  assert.equal(mediaType("file:///v/Makefile"), "application/octet-stream");
  assert.equal(mediaType("file:///v.d/README"), "application/octet-stream");
});
