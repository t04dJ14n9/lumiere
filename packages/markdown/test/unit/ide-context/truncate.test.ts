import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CAPS } from "../../../src/shared/ide-context/caps";
import { truncatePacket } from "../../../src/shared/ide-context/truncate";

test("truncatePacket shrinks active.selection.text before dropping diagnostics", () => {
  const huge = "x".repeat(20_000);
  const packet = truncatePacket(
    {
      version: 1,
      collectedAt: "2026-10-16T00:00:00.000Z",
      product: "markdownWorkshop",
      markdown: { editorKind: "text" },
      active: {
        uri: "file:///note.md",
        selection: {
          from: 0,
          to: huge.length,
          startLine: 1,
          endLine: 1,
          text: huge,
          truncated: false,
        },
      },
      tabs: { visible: ["file:///note.md"], open: [], truncated: false },
      diagnostics: {
        uri: "file:///note.md",
        items: [
          { severity: "error", message: "e", startLine: 1, startCharacter: 0 },
        ],
        truncated: false,
      },
      warnings: [],
      caps: { ...DEFAULT_CAPS, maxSelectedChars: 10, maxJsonChars: 2_000 },
    },
    { ...DEFAULT_CAPS, maxSelectedChars: 10, maxJsonChars: 2_000 },
  );
  assert.ok((packet.active?.selection?.text.length ?? 0) <= 10);
  assert.equal(packet.active?.selection?.truncated, true);
  assert.ok(packet.warnings.some((w) => /budget|truncat/i.test(w)));
});

test("truncatePacket keeps pdf.selection kind while shrinking text/rects", () => {
  const packet = truncatePacket(
    {
      version: 1,
      collectedAt: "2026-10-16T00:00:00.000Z",
      product: "pdfWorkshop",
      active: { uri: "file:///a.pdf" },
      pdf: {
        uri: "file:///a.pdf",
        selection: {
          kind: "text",
          text: "y".repeat(5000),
          truncated: false,
          rects: Array.from({ length: 40 }, (_, i) => ({
            page: 1,
            x: i,
            y: 0,
            w: 1,
            h: 1,
          })),
          rectsTruncated: false,
        },
      },
      tabs: { visible: [], open: [], truncated: false },
      diagnostics: { uri: "file:///a.pdf", items: [], truncated: false },
      warnings: [],
      caps: DEFAULT_CAPS,
    },
    { ...DEFAULT_CAPS, maxPdfSelectedChars: 8, maxPdfSelectionRects: 2 },
  );
  assert.equal(packet.pdf?.selection.kind, "text");
  if (packet.pdf?.selection.kind === "text") {
    assert.ok(packet.pdf.selection.text.length <= 8);
    assert.ok((packet.pdf.selection.rects?.length ?? 0) <= 2);
  }
});
