// test/unit/ide-context/types.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CAPS, assertPacketInvariants } from "../../src/ide-context";

test("DEFAULT_CAPS dual output ceilings", () => {
  assert.equal(DEFAULT_CAPS.maxClipboardChars, 32_000);
  assert.equal(DEFAULT_CAPS.maxJsonChars, 64_000);
  assert.equal(DEFAULT_CAPS.maxPdfSelectedChars, 8_000);
  assert.equal(DEFAULT_CAPS.maxPdfSelectionRects, 32);
});

test("assertPacketInvariants: MW forbids pdf slice", () => {
  assert.throws(() =>
    assertPacketInvariants({
      version: 1,
      collectedAt: "2026-10-16T00:00:00.000Z",
      product: "markdownWorkshop",
      markdown: { editorKind: "livePreview" },
      pdf: { uri: "file:///x.pdf", selection: { kind: "none" } },
      tabs: { visible: [], open: [], truncated: false },
      diagnostics: { uri: "file:///a.md", items: [], truncated: false },
      warnings: [],
      caps: DEFAULT_CAPS,
    } as never),
  );
});

test("assertPacketInvariants: PDF requires active.uri === pdf.uri and pdf.selection", () => {
  assert.throws(() =>
    assertPacketInvariants({
      version: 1,
      collectedAt: "2026-10-16T00:00:00.000Z",
      product: "pdfWorkshop",
      pdf: { uri: "file:///a.pdf", selection: { kind: "none" } },
      active: { uri: "file:///other.pdf" },
      tabs: { visible: [], open: [], truncated: false },
      diagnostics: { uri: "file:///a.pdf", items: [], truncated: false },
      warnings: [],
      caps: DEFAULT_CAPS,
    }),
  );
});
