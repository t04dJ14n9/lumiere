import { pdfTarget } from "./text";
import {
  assertLines,
  assertRect,
  assertTimestamp,
  normalizeHash,
} from "./checks";
import type {
  BridgeEnvelope,
  MarkdownEnvelopeInput,
  PdfEnvelopeInput,
} from "./model";

export function buildMarkdownEnvelope(
  input: MarkdownEnvelopeInput,
): BridgeEnvelope {
  assertTimestamp(input.capturedAt, "capturedAt");
  if (input.publishedAt) {
    assertTimestamp(input.publishedAt, "publishedAt");
  }
  assertLines(input.startLine, input.endLine);
  const durable = durableLocator(input);
  return Object.freeze({
    version: 1,
    producer: "markdown",
    capturedAt: input.capturedAt,
    source: sourceFields(input, "markdown"),
    locator: {
      ...(durable ? { durable } : {}),
      ...lineField(input.startLine, input.endLine),
    },
    ...viewField(input.viewId),
    selection: selectionField(input.text, input.selectionSha256),
    revision: revisionFields(input),
    ...wikiField(input.wiki),
  });
}

export function buildPdfEnvelope(input: PdfEnvelopeInput): BridgeEnvelope {
  assertTimestamp(input.capturedAt, "capturedAt");
  if (input.publishedAt) {
    assertTimestamp(input.publishedAt, "publishedAt");
  }
  if (!Number.isInteger(input.page) || input.page < 1) {
    throw new TypeError("PDF locator page must be a positive integer.");
  }
  const viewRect = input.viewRect ? assertRect(input.viewRect) : undefined;
  const durable = pdfTarget({
    path: input.identity,
    page: input.page,
    ...(viewRect ? { viewRect } : {}),
  });
  rejectViewAsLocator(input.viewId, durable);
  const kind = input.kind ?? "file";
  return Object.freeze({
    version: 1,
    producer: "pdf",
    capturedAt: input.capturedAt,
    source: sourceFields({ ...input, kind }, "pdf"),
    locator: {
      durable,
      pdf: { page: input.page, ...(viewRect ? { viewRect } : {}) },
    },
    ...viewField(input.viewId),
    selection: selectionField(input.text, input.selectionSha256),
    revision: revisionFields({ ...input, kind }),
  });
}

function durableLocator(input: MarkdownEnvelopeInput): string | undefined {
  if (input.kind === "untitled") {
    if (input.durable) {
      throw new TypeError("An untitled note has no durable locator.");
    }
    if (!input.viewId) {
      throw new TypeError("An untitled note needs a temporary view id.");
    }
    return undefined;
  }
  if (!input.durable) {
    throw new TypeError("A file or remote source needs a durable locator.");
  }
  rejectViewAsLocator(input.viewId, input.durable);
  return input.durable;
}

function rejectViewAsLocator(
  viewId: string | undefined,
  durable: string,
): void {
  if (viewId && viewId === durable) {
    throw new TypeError("A view id is not a durable locator.");
  }
}

function sourceFields(
  input: {
    readonly identity: string;
    readonly kind: BridgeEnvelope["source"]["kind"];
    readonly publishedAt?: string;
    readonly title?: string;
  },
  media: BridgeEnvelope["source"]["media"],
): BridgeEnvelope["source"] {
  return {
    identity: input.identity,
    kind: input.kind,
    media,
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
    ...(input.title ? { title: input.title } : {}),
  };
}

function revisionFields(input: {
  readonly isDirty: boolean;
  readonly kind?: BridgeEnvelope["source"]["kind"];
  readonly documentVersion?: number;
  readonly sourceSha256?: string;
}): BridgeEnvelope["revision"] {
  const untitled = input.kind === "untitled";
  const sourceSha256 =
    input.isDirty || untitled ? undefined : hashOrThrow(input.sourceSha256);
  if (!input.isDirty && !untitled && !sourceSha256) {
    throw new TypeError("A saved source needs a whole-source hash.");
  }
  return {
    isDirty: input.isDirty,
    ...(input.documentVersion !== undefined
      ? { documentVersion: input.documentVersion }
      : {}),
    ...(sourceSha256 ? { sourceSha256 } : {}),
  };
}

function hashOrThrow(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return normalizeHash(value);
}

function selectionField(
  text: string,
  sha256: string,
): BridgeEnvelope["selection"] {
  return { text, sha256: normalizeHash(sha256) };
}

function lineField(startLine?: number, endLine?: number) {
  if (startLine === undefined || endLine === undefined) {
    return {};
  }
  return { markdown: { startLine, endLine } };
}

function viewField(viewId?: string) {
  return viewId ? { view: { id: viewId } } : {};
}

function wikiField(wiki: MarkdownEnvelopeInput["wiki"]) {
  return wiki ? { wiki } : {};
}
