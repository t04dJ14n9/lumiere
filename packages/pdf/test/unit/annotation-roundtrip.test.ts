import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createPdfiumEngine } from "@embedpdf/engines/pdfium-direct-engine";
import { PdfAnnotationSubtype, PdfBlendMode } from "@embedpdf/models";
import { writeAtomicFile } from "../../src/host/atomic-write";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wasmPath = path.join(
  root,
  "node_modules/@embedpdf/pdfium/dist/pdfium.wasm",
);
const fixturePath = path.join(root, "test/fixtures/generated/short.pdf");

test("highlight annotation survives saveAsCopy → atomic write → reopen", async () => {
  const wasm = readFileSync(wasmPath);
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/wasm");
    res.end(wasm);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  const url = `http://127.0.0.1:${port}/pdfium.wasm`;
  try {
    const engine = await createPdfiumEngine(url, { fontFallback: null });
    const bytes = readFileSync(fixturePath);
    const content = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const doc = await engine
      .openDocumentBuffer({ id: "d1", content })
      .toPromise();
    const page = doc.pages[0]!;
    const rect = {
      origin: { x: 72, y: 280 },
      size: { width: 120, height: 18 },
    };
    await engine
      .createPageAnnotation(doc, page, {
        type: PdfAnnotationSubtype.HIGHLIGHT,
        id: `rt-${Date.now()}`,
        pageIndex: 0,
        rect,
        segmentRects: [rect],
        strokeColor: "#FFE600",
        color: "#FFE600",
        opacity: 0.5,
        blendMode: PdfBlendMode.Multiply,
        author: "Lumière",
        contents: "roundtrip",
        created: new Date(),
        modified: new Date(),
      })
      .toPromise();
    const saved = await engine.saveAsCopy(doc).toPromise();
    await engine.closeDocument(doc).toPromise();

    const dir = await mkdtemp(path.join(tmpdir(), "lumiere-ann-rt-"));
    const target = path.join(dir, "annotated.pdf");
    await writeAtomicFile(target, new Uint8Array(saved));
    const onDisk = await readFile(target);

    const doc2 = await engine
      .openDocumentBuffer({
        id: "d2",
        content: onDisk.buffer.slice(
          onDisk.byteOffset,
          onDisk.byteOffset + onDisk.byteLength,
        ),
      })
      .toPromise();
    const annots = await engine
      .getPageAnnotations(doc2, doc2.pages[0]!)
      .toPromise();
    assert.ok(
      annots.some((a) => a.type === PdfAnnotationSubtype.HIGHLIGHT),
      `expected Highlight among ${JSON.stringify(annots.map((a) => a.type))}`,
    );
    await engine.closeDocument(doc2).toPromise();
  } finally {
    server.close();
  }
});
