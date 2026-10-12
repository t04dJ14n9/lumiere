import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarkdownEnvelope,
  buildPdfEnvelope,
  parseBridgeEnvelope,
} from "../../../src/shared/bridge/envelope";
import type {
  BridgeEnvelope,
  MarkdownEnvelopeInput,
} from "../../../src/shared/bridge/envelope";

const CAPTURED = "2026-10-11T12:00:00.000Z";
const PUBLISHED = "2020-01-02T03:04:05Z";
const SELECTION = "a".repeat(64);
const SOURCE = "b".repeat(64);

function saved(extra: Partial<MarkdownEnvelopeInput> = {}) {
  return buildMarkdownEnvelope({
    identity: "notes/a.md",
    kind: "file",
    capturedAt: CAPTURED,
    publishedAt: PUBLISHED,
    title: "Attention",
    durable: "@notes/a.md#3-5",
    startLine: 3,
    endLine: 5,
    viewId: "panel-1",
    text: "Selected",
    selectionSha256: SELECTION,
    documentVersion: 4,
    sourceSha256: SOURCE,
    isDirty: false,
    wiki: {
      preset: "slim",
      bundle: "knowledge",
      collection: "$concepts",
      type: "Concept",
    },
    ...extra,
  });
}

test("a saved note keeps the durable locator apart from the view and the two hashes", () => {
  const envelope = saved();
  assert.equal(envelope.version, 1);
  assert.equal(envelope.locator.durable, "@notes/a.md#3-5");
  assert.equal(envelope.view?.id, "panel-1");
  assert.notEqual(envelope.view?.id, envelope.locator.durable);
  assert.equal(envelope.capturedAt, CAPTURED);
  assert.equal(envelope.source.publishedAt, PUBLISHED);
  assert.notEqual(envelope.capturedAt, envelope.source.publishedAt);
  assert.equal(envelope.selection.sha256, SELECTION);
  assert.equal(envelope.revision.sourceSha256, SOURCE);
  assert.notEqual(envelope.selection.sha256, envelope.revision.sourceSha256);
  assert.equal(envelope.wiki?.collection, "$concepts");
});

test("parse keeps unknown top-level fields and drops unknown nested fields", () => {
  const envelope = saved();
  const parsed = parseBridgeEnvelope({
    ...envelope,
    note: "keep",
    source: { ...envelope.source, ignored: true },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.envelope.extra?.note, "keep");
  assert.equal("ignored" in parsed.envelope.source, false);
});

test("an unknown version fails closed", () => {
  const parsed = parseBridgeEnvelope({ ...saved(), version: 2 });
  assert.deepEqual(parsed, { ok: false, reason: "unsupported-version" });
});

test("a view id cannot repeat the durable locator", () => {
  assert.throws(
    () => saved({ viewId: "@notes/a.md#3-5" }),
    /view id is not a durable locator/,
  );
});

test("a dirty note omits the whole-source hash", () => {
  const envelope = buildMarkdownEnvelope({
    identity: "notes/a.md",
    kind: "file",
    capturedAt: CAPTURED,
    durable: "@notes/a.md#1",
    startLine: 1,
    endLine: 1,
    viewId: "panel-1",
    text: "Edited",
    selectionSha256: SELECTION,
    sourceSha256: SOURCE,
    isDirty: true,
  });
  assert.equal(envelope.revision.isDirty, true);
  assert.equal(envelope.revision.sourceSha256, undefined);
  assert.equal(envelope.locator.durable, "@notes/a.md#1");
});

test("a dirty envelope that still carries a source hash is rejected", () => {
  const envelope = saved();
  const parsed = parseBridgeEnvelope({
    ...envelope,
    revision: { ...envelope.revision, isDirty: true, sourceSha256: SOURCE },
  });
  assert.equal(parsed.ok, false);
});

test("an untitled note has a view id and no durable locator", () => {
  const envelope = buildMarkdownEnvelope({
    identity: "untitled:1",
    kind: "untitled",
    capturedAt: CAPTURED,
    viewId: "panel-9",
    text: "Draft",
    selectionSha256: SELECTION,
    isDirty: true,
  });
  assert.equal(envelope.locator.durable, undefined);
  assert.equal(envelope.view?.id, "panel-9");
  assert.equal(envelope.revision.sourceSha256, undefined);
});

test("a saved source without a whole-source hash is refused", () => {
  assert.throws(
    () =>
      buildMarkdownEnvelope({
        identity: "notes/a.md",
        kind: "file",
        capturedAt: CAPTURED,
        durable: "@notes/a.md#1",
        startLine: 1,
        endLine: 1,
        text: "Saved",
        selectionSha256: SELECTION,
        isDirty: false,
      }),
    /whole-source hash/,
  );
});

test("short hashes are accepted and stored lowercase", () => {
  const envelope = buildMarkdownEnvelope({
    identity: "notes/a.md",
    kind: "file",
    capturedAt: CAPTURED,
    durable: "@notes/a.md#1",
    startLine: 1,
    endLine: 1,
    text: "Saved",
    selectionSha256: "9F86D081884C7D65",
    sourceSha256: "AB".repeat(8),
    isDirty: false,
  });
  assert.equal(envelope.selection.sha256, "9f86d081884c7d65");
  const parsed = parseBridgeEnvelope(
    JSON.parse(JSON.stringify(envelope)) as BridgeEnvelope,
  );
  assert.equal(parsed.ok, true);
});

test("a PDF envelope's durable locator carries the page and view rect", () => {
  const envelope = buildPdfEnvelope({
    identity: "papers/attention.pdf",
    capturedAt: CAPTURED,
    page: 3,
    viewRect: { x: 72, y: 83, width: 134, height: 21 },
    viewId: "pdf-panel",
    text: "Scaled dot-product attention",
    selectionSha256: SELECTION,
    sourceSha256: "9f86d081884c7d65",
    isDirty: false,
  });
  assert.equal(
    envelope.locator.durable,
    "papers/attention.pdf#page=3&viewrect=72,83,134,21",
  );
  assert.equal(envelope.view?.id, "pdf-panel");
  assert.equal(parseBridgeEnvelope(envelope).ok, true);
});
