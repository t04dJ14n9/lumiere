import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  BRIDGE_ENVELOPE_VERSION,
  MARKDOWN_BRIDGE_ENVELOPE_COMMAND,
  PDF_BRIDGE_ENVELOPE_COMMAND,
  PDF_BRIDGE_PRODUCER,
  durableLocatorBase,
  pdfBridgeEnvelope,
  selectionCanonical,
} from "../../src/shared/bridge-envelope";
import { hashSelection } from "../../src/extension/plugins/agentBridge/envelope";
import { PdfSelectionState } from "../../src/extension/plugins/pdf/selection";
import { createPdfViewId } from "../../src/extension/plugins/pdf/view-id";
import { parseWorkbenchBridgeEnvelope } from "./support/workbench-bridge-parse";

const sourceHash = "ab".repeat(32);
const textSelection = {
  kind: "text" as const,
  text: "Scaled dot-product attention",
  pages: [
    {
      page: 3,
      rects: [
        [72, 83, 150, 95],
        [72, 95, 206, 104],
      ] as [number, number, number, number][],
    },
  ],
};

test("a text selection envelope keeps source identity, durable locators, and the temporary view id apart", () => {
  const envelope = pdfBridgeEnvelope({
    capturedAt: "2026-10-11T12:00:00.000Z",
    identity: "papers/attention_v2.pdf",
    durableBase: "papers/attention_v2.pdf",
    viewId: "pdf:temp-view",
    selection: textSelection,
    selectionSha256: hashSelection(textSelection),
    sourceSha256: sourceHash,
  });

  assert.equal(envelope.version, BRIDGE_ENVELOPE_VERSION);
  assert.equal(envelope.version, 1);
  assert.equal(envelope.producer, PDF_BRIDGE_PRODUCER);
  assert.equal(envelope.producer, "pdf");
  assert.equal(PDF_BRIDGE_ENVELOPE_COMMAND, "vscodeEmbedPdf.bridge.envelope");
  assert.equal(
    MARKDOWN_BRIDGE_ENVELOPE_COMMAND,
    "markdownWorkshop.bridge.envelope",
  );
  assert.deepEqual(envelope.source, {
    identity: "papers/attention_v2.pdf",
    kind: "file",
    media: "pdf",
  });
  assert.equal(envelope.view?.id, "pdf:temp-view");
  assert.equal(envelope.capturedAt, "2026-10-11T12:00:00.000Z");
  assert.notEqual(envelope.selection.sha256, envelope.revision.sourceSha256);
  assert.equal(
    envelope.selection.sha256,
    createHash("sha256")
      .update(selectionCanonical(textSelection))
      .digest("hex"),
  );
  assert.equal(
    envelope.locator.durable,
    "papers/attention_v2.pdf#page=3&viewrect=72,83,134,21",
  );
  assert.deepEqual(envelope.locator.pdf, {
    page: 3,
    viewRect: { x: 72, y: 83, width: 134, height: 21 },
  });
  assert.notEqual(envelope.view?.id, envelope.locator.durable);
  assert.equal(envelope.selection.text, "Scaled dot-product attention");
  assert.equal(envelope.revision.isDirty, false);
  assert.equal(envelope.revision.sourceSha256, sourceHash);
});

test("PDF envelopes parse as Workbench v1 (Markdown Workshop field names)", () => {
  const envelope = pdfBridgeEnvelope({
    capturedAt: "2026-10-11T12:00:00.000Z",
    identity: "papers/attention_v2.pdf",
    durableBase: "papers/attention_v2.pdf",
    viewId: "pdf:temp-view",
    selection: textSelection,
    selectionSha256: hashSelection(textSelection),
    sourceSha256: sourceHash,
  });
  const parsed = parseWorkbenchBridgeEnvelope(envelope);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.envelope.producer, "pdf");
  assert.equal(parsed.envelope.capturedAt, "2026-10-11T12:00:00.000Z");
  assert.equal(
    (parsed.envelope.source as { identity: string }).identity,
    "papers/attention_v2.pdf",
  );
  assert.equal((parsed.envelope.source as { kind: string }).kind, "file");
  assert.equal((parsed.envelope.source as { media: string }).media, "pdf");
  assert.equal(
    (parsed.envelope.locator as { durable: string }).durable,
    envelope.locator.durable,
  );
  assert.equal((parsed.envelope.view as { id: string }).id, "pdf:temp-view");
  assert.equal(
    (parsed.envelope.selection as { text: string }).text,
    textSelection.text,
  );
  assert.equal(
    (parsed.envelope.revision as { isDirty: boolean }).isDirty,
    false,
  );
  assert.equal(
    (parsed.envelope.revision as { sourceSha256: string }).sourceSha256,
    sourceHash,
  );

  // The pre-alignment PDF shape must fail closed (missing capturedAt, wrong source shape).
  const legacy = {
    version: 1,
    producer: "pdf",
    publishedAt: "2026-10-11T12:00:05.000Z",
    source: { uri: "file:///work/a.pdf", path: "a.pdf", sha256: sourceHash },
    viewId: "pdf:temp-view",
    selection: {
      selectedAt: "2026-10-11T12:00:00.000Z",
      sha256: "cd".repeat(32),
      kind: "text",
      locators: ["a.pdf#page=1"],
      text: "hi",
    },
  };
  const rejected = parseWorkbenchBridgeEnvelope(legacy);
  assert.equal(rejected.ok, false);
});

test("a region and a selection across pages keep #page= and viewrect locators", () => {
  const region = {
    kind: "region" as const,
    page: 7,
    rect: [150, 200, 250, 300] as [number, number, number, number],
    text: "Table 3",
  };
  const regionEnvelope = pdfBridgeEnvelope({
    capturedAt: "2026-10-11T12:00:00.000Z",
    identity: "papers/attention_v2.pdf",
    durableBase: "papers/attention_v2.pdf",
    viewId: "pdf:temp-view",
    selection: region,
    selectionSha256: hashSelection(region),
    sourceSha256: sourceHash,
  });
  assert.equal(
    regionEnvelope.locator.durable,
    "papers/attention_v2.pdf#page=7&viewrect=150,200,100,100",
  );
  assert.deepEqual(regionEnvelope.locator.pdf, {
    page: 7,
    viewRect: { x: 150, y: 200, width: 100, height: 100 },
  });
  assert.equal(regionEnvelope.selection.text, "Table 3");
  assert.notEqual(
    regionEnvelope.selection.sha256,
    hashSelection(textSelection),
  );
  assert.equal(parseWorkbenchBridgeEnvelope(regionEnvelope).ok, true);

  const across = {
    kind: "text" as const,
    text: "end of one page and start of the next",
    pages: [
      {
        page: 4,
        rects: [[72, 350, 200, 362]] as [number, number, number, number][],
      },
      {
        page: 5,
        rects: [[72, 40, 180, 52]] as [number, number, number, number][],
      },
    ],
  };
  const acrossEnvelope = pdfBridgeEnvelope({
    capturedAt: "2026-10-11T12:00:01.000Z",
    identity: "papers/attention_v2.pdf",
    durableBase: "papers/attention_v2.pdf",
    viewId: "pdf:other-view",
    selection: across,
    selectionSha256: hashSelection(across),
    sourceSha256: sourceHash,
  });
  // Workbench v1 carries one locator: the first page.
  assert.equal(
    acrossEnvelope.locator.durable,
    "papers/attention_v2.pdf#page=4&viewrect=72,350,128,12",
  );
  assert.equal(acrossEnvelope.locator.pdf.page, 4);
});

test("selectionCanonical distinguishes text that embeds a page:rect line from a multi-page selection", () => {
  const collisionA = {
    kind: "text" as const,
    text: "foo\n3:1,2,3,4",
    pages: [
      { page: 4, rects: [[5, 6, 7, 8]] as [number, number, number, number][] },
    ],
  };
  const collisionB = {
    kind: "text" as const,
    text: "foo",
    pages: [
      { page: 3, rects: [[1, 2, 3, 4]] as [number, number, number, number][] },
      { page: 4, rects: [[5, 6, 7, 8]] as [number, number, number, number][] },
    ],
  };
  assert.notEqual(
    selectionCanonical(collisionA),
    selectionCanonical(collisionB),
  );
  assert.notEqual(hashSelection(collisionA), hashSelection(collisionB));
});

test("a repeated selection keeps its timestamp; a new selection or file version does not", () => {
  const state = new PdfSelectionState();
  const region = {
    kind: "region" as const,
    page: 1,
    rect: [1, 2, 11, 12] as [number, number, number, number],
  };
  state.set(region, "file-hash", undefined, "2026-10-11T00:00:00.000Z");
  state.set(
    region,
    "file-hash",
    "data:image/png;base64,qq",
    "2026-10-11T00:00:01.000Z",
  );
  assert.equal(state.snapshot()?.selectedAt, "2026-10-11T00:00:00.000Z");
  assert.equal(state.snapshot()?.image, "data:image/png;base64,qq");
  state.set(
    { ...region, text: "cell" },
    "file-hash",
    undefined,
    "2026-10-11T00:00:02.000Z",
  );
  assert.equal(state.snapshot()?.selectedAt, "2026-10-11T00:00:02.000Z");
  state.set(region, "other-file-hash", undefined, "2026-10-11T00:00:03.000Z");
  assert.equal(state.snapshot()?.selectedAt, "2026-10-11T00:00:03.000Z");
  state.set(undefined, "other-file-hash");
  assert.equal(state.snapshot(), undefined);
});

test("a view id is temporary and is not a page locator", () => {
  const first = createPdfViewId();
  const second = createPdfViewId();
  assert.notEqual(first, second);
  assert.match(first, /^pdf:[0-9a-f-]{36}$/u);
  assert.equal(first.includes("#page="), false);
  assert.equal(first.includes("viewrect"), false);
});

test("locator.durable encodes # in the path so resolvePdfUri can reopen it", () => {
  const selection = {
    kind: "text" as const,
    text: "draft section",
    pages: [
      {
        page: 3,
        rects: [[10, 20, 30, 40]] as [number, number, number, number][],
      },
    ],
  };
  const envelope = pdfBridgeEnvelope({
    capturedAt: "2026-10-11T12:00:00.000Z",
    identity: "papers/report#draft.pdf",
    durableBase: "file:///work/papers/report#draft.pdf",
    viewId: "pdf:temp-view",
    selection,
    selectionSha256: hashSelection(selection),
    sourceSha256: sourceHash,
  });
  assert.equal(envelope.source.identity, "papers/report#draft.pdf");
  assert.equal(
    envelope.locator.durable,
    "file:///work/papers/report%23draft.pdf#page=3&viewrect=10,20,20,20",
  );
  assert.equal(envelope.locator.durable.includes("report#draft"), false);
  assert.equal(parseWorkbenchBridgeEnvelope(envelope).ok, true);
});

test("durableLocatorBase keeps ? query delimiters on serialized URIs", () => {
  const selection = {
    kind: "text" as const,
    text: "revved",
    pages: [
      {
        page: 2,
        rects: [[10, 20, 30, 40]] as [number, number, number, number][],
      },
    ],
  };
  const uri = "custom://host/report.pdf?rev=123";
  assert.equal(
    durableLocatorBase(uri),
    uri,
    "must not percent-encode ? on a URI",
  );
  const envelope = pdfBridgeEnvelope({
    capturedAt: "2026-10-11T12:00:00.000Z",
    identity: "report.pdf",
    durableBase: uri,
    kind: "remote",
    viewId: "pdf:temp-view",
    selection,
    selectionSha256: hashSelection(selection),
    sourceSha256: sourceHash,
  });
  assert.equal(
    envelope.locator.durable,
    "custom://host/report.pdf?rev=123#page=2&viewrect=10,20,20,20",
  );
  assert.equal(envelope.locator.durable.includes("%3F"), false);
  assert.match(envelope.locator.durable, /\.pdf\?rev=123#page=/u);
  assert.equal(parseWorkbenchBridgeEnvelope(envelope).ok, true);
});

test("durableLocatorBase still encodes # and ? on raw filesystem paths", () => {
  assert.equal(
    durableLocatorBase("papers/report#draft.pdf"),
    "papers/report%23draft.pdf",
  );
  assert.equal(durableLocatorBase("papers/weird?.pdf"), "papers/weird%3F.pdf");
});
