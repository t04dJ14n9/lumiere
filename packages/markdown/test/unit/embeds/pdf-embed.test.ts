import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import {
  formatPdfOpenTarget,
  parsePdfEmbedSubpath,
  pdfFilename,
  renderPdfPageFromBytes,
} from "../../../src/plugins/embeds/pdf-embed";

const require = createRequire(import.meta.url);

test("parsePdfEmbedSubpath parses #page=N, #height=H, and #page=N&height=H", () => {
  assert.deepEqual(parsePdfEmbedSubpath("document.pdf"), { page: 1 });
  assert.deepEqual(parsePdfEmbedSubpath("document.pdf#page=3"), { page: 3 });
  assert.deepEqual(parsePdfEmbedSubpath("document.pdf#height=400"), {
    page: 1,
    height: 400,
  });
  assert.deepEqual(parsePdfEmbedSubpath("document.pdf#page=3&height=400"), {
    page: 3,
    height: 400,
  });
  assert.deepEqual(
    parsePdfEmbedSubpath("folder/doc.pdf#height=320&page=4|Alias"),
    {
      page: 4,
      height: 320,
    },
  );
  assert.deepEqual(parsePdfEmbedSubpath("document.pdf", 360), {
    page: 1,
    height: 360,
  });
  assert.deepEqual(parsePdfEmbedSubpath("document.pdf#page=0&height=-10"), {
    page: 1,
  });
});

test("formatPdfOpenTarget and pdfFilename format viewer open targets and display names", () => {
  assert.equal(
    formatPdfOpenTarget("attachments/paper.pdf", 1),
    "attachments/paper.pdf#page=1",
  );
  assert.equal(
    formatPdfOpenTarget("attachments/paper.pdf#page=3&height=400", 3),
    "attachments/paper.pdf#page=3",
  );
  assert.equal(
    formatPdfOpenTarget("attachments/paper.pdf#height=400|Paper", 5),
    "attachments/paper.pdf#page=5",
  );
  assert.equal(
    pdfFilename("attachments/my%20paper.pdf#page=2&height=400"),
    "my paper.pdf",
  );
});

test("renderPdfPageFromBytes renders PDF pages via @embedpdf/pdfium WASM", async () => {
  const pdfiumEntry = require.resolve("@embedpdf/pdfium");
  const wasmBuffer = readFileSync(
    path.join(path.dirname(pdfiumEntry), "pdfium.wasm"),
  );
  const wasmArrayBuffer = wasmBuffer.buffer.slice(
    wasmBuffer.byteOffset,
    wasmBuffer.byteOffset + wasmBuffer.byteLength,
  );
  const samplePdf = new Uint8Array(
    readFileSync(path.resolve("test/fixtures/vault/attachments/sample.pdf")),
  );

  const rendered = await renderPdfPageFromBytes(
    samplePdf,
    1,
    600,
    wasmArrayBuffer,
  );
  assert.equal(rendered.pageCount, 1);
  assert.equal(rendered.page, 1);
  assert.ok(rendered.width >= 600);
  assert.ok(rendered.height > 0);
  assert.equal(rendered.rgba.length, rendered.width * rendered.height * 4);

  const clamped = await renderPdfPageFromBytes(
    samplePdf,
    5,
    600,
    wasmArrayBuffer,
  );
  assert.equal(clamped.page, 1);
});
