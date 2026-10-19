import {
  asObject,
  assertRect,
  assertTimestamp,
  normalizeHash,
  optionalInteger,
  optionalText,
  readWikiContext,
  requiredString,
} from "./checks";
import { BRIDGE_ENVELOPE_VERSION, BRIDGE_KEYS } from "./model";
import type { BridgeEnvelope, BridgeViewRect, EnvelopeParse } from "./model";

/** Unknown versions fail closed so the caller can fall back. */
export function parseBridgeEnvelope(value: unknown): EnvelopeParse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "expected-object" };
  }
  const input = value as Record<string, unknown>;
  if (input.version !== BRIDGE_ENVELOPE_VERSION) {
    return { ok: false, reason: "unsupported-version" };
  }
  try {
    return { ok: true, envelope: readEnvelope(input) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid-envelope";
    return { ok: false, reason };
  }
}

function readEnvelope(input: Record<string, unknown>): BridgeEnvelope {
  const producer = input.producer;
  if (producer !== "markdown" && producer !== "pdf") {
    throw new TypeError("producer must be markdown or pdf");
  }
  const capturedAt = requiredString(input.capturedAt, "capturedAt");
  assertTimestamp(capturedAt, "capturedAt");
  const locator = readLocator(input.locator);
  const view = readView(input.view, locator.durable);
  const extra = unknownFields(input);
  const wiki = readWikiContext(input.wiki);
  return Object.freeze({
    version: 1,
    producer,
    capturedAt,
    source: readSource(input.source),
    locator,
    ...(view ? { view } : {}),
    selection: readSelection(input.selection),
    revision: readRevision(input.revision),
    ...(wiki ? { wiki } : {}),
    ...(extra ? { extra } : {}),
  });
}

function readSource(value: unknown): BridgeEnvelope["source"] {
  const input = asObject(value, "source");
  const kind = input.kind;
  const media = input.media;
  if (kind !== "file" && kind !== "untitled" && kind !== "remote") {
    throw new TypeError("source.kind is invalid");
  }
  if (media !== "markdown" && media !== "pdf" && media !== "other") {
    throw new TypeError("source.media is invalid");
  }
  const publishedAt = optionalText(input.publishedAt, "source.publishedAt");
  if (publishedAt) {
    assertTimestamp(publishedAt, "source.publishedAt");
  }
  const title = optionalText(input.title, "source.title");
  return {
    identity: requiredString(input.identity, "source.identity"),
    kind,
    media,
    ...(publishedAt ? { publishedAt } : {}),
    ...(title ? { title } : {}),
  };
}

function readLocator(value: unknown): BridgeEnvelope["locator"] {
  const input = asObject(value, "locator");
  const durable = optionalText(input.durable, "locator.durable");
  const markdown = readLines(input.markdown);
  const pdf = readPdf(input.pdf);
  return {
    ...(durable ? { durable } : {}),
    ...(markdown ? { markdown } : {}),
    ...(pdf ? { pdf } : {}),
  };
}

function readLines(
  value: unknown,
): { startLine: number; endLine: number } | undefined {
  if (value === undefined) {
    return undefined;
  }
  const input = asObject(value, "locator.markdown");
  const startLine = optionalInteger(input.startLine, "startLine");
  const endLine = optionalInteger(input.endLine, "endLine");
  if (
    startLine === undefined ||
    endLine === undefined ||
    endLine < startLine ||
    startLine < 1
  ) {
    throw new TypeError("markdown locator lines are invalid");
  }
  return { startLine, endLine };
}

function readPdf(
  value: unknown,
): { page: number; viewRect?: BridgeViewRect } | undefined {
  if (value === undefined) {
    return undefined;
  }
  const input = asObject(value, "locator.pdf");
  const page = optionalInteger(input.page, "page");
  if (page === undefined || page < 1) {
    throw new TypeError("pdf page is invalid");
  }
  if (input.viewRect === undefined) {
    return { page };
  }
  return { page, viewRect: assertRect(input.viewRect) };
}

function readSelection(value: unknown): BridgeEnvelope["selection"] {
  const input = asObject(value, "selection");
  if (typeof input.text !== "string") {
    throw new TypeError("selection.text must be a string");
  }
  return {
    text: input.text,
    sha256: normalizeHash(requiredString(input.sha256, "selection.sha256")),
  };
}

function readRevision(value: unknown): BridgeEnvelope["revision"] {
  const input = asObject(value, "revision");
  if (typeof input.isDirty !== "boolean") {
    throw new TypeError("revision.isDirty must be boolean");
  }
  const sourceSha256 = optionalText(
    input.sourceSha256,
    "revision.sourceSha256",
  );
  if (input.isDirty && sourceSha256) {
    throw new TypeError("a dirty source has no whole-source hash");
  }
  const documentVersion = optionalInteger(
    input.documentVersion,
    "documentVersion",
  );
  return {
    isDirty: input.isDirty,
    ...(documentVersion !== undefined ? { documentVersion } : {}),
    ...(sourceSha256 ? { sourceSha256: normalizeHash(sourceSha256) } : {}),
  };
}

function readView(
  value: unknown,
  durable: string | undefined,
): { id: string } | undefined {
  if (value === undefined) {
    return undefined;
  }
  const id = requiredString(asObject(value, "view").id, "view.id");
  if (durable && id === durable) {
    throw new TypeError("view.id must not repeat the durable locator");
  }
  return { id };
}

function unknownFields(
  input: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!BRIDGE_KEYS.has(key)) {
      extra[key] = value;
    }
  }
  return Object.keys(extra).length === 0 ? undefined : extra;
}
