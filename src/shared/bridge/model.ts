/**
 * Versioned selection envelope shared by Markdown Workbench and, when it is
 * installed, Agent PDF Viewer. This is a workbench protocol, not OKF
 * metadata. Version 1 carries one locator.
 *
 * `locator.durable` reopens the spot after the view is gone.
 * `view.id` is the live panel and is not a locator.
 * `capturedAt` is when the selection was taken.
 * `source.publishedAt` is when the source itself was published or captured.
 * `selection.sha256` hashes the selected text.
 * `revision.sourceSha256` hashes the whole saved source and is omitted while
 * the source is dirty or untitled.
 */
export const BRIDGE_ENVELOPE_VERSION = 1;

/** Soft command. Absent when Agent PDF Viewer is not installed. */
export const PDF_BRIDGE_COMMAND = "vscodeEmbedPdf.bridge.envelope";

export const MARKDOWN_BRIDGE_COMMAND = "markdownWorkbench.bridge.envelope";

export const BRIDGE_KEYS = new Set([
  "version",
  "producer",
  "capturedAt",
  "source",
  "locator",
  "view",
  "selection",
  "revision",
  "wiki",
]);

export interface BridgeWikiContext {
  readonly preset?: string;
  readonly bundle?: string;
  readonly collection?: string;
  readonly type?: string;
}

export interface BridgeViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BridgeEnvelope {
  readonly version: 1;
  readonly producer: "markdown" | "pdf";
  readonly capturedAt: string;
  readonly source: {
    readonly identity: string;
    readonly kind: "file" | "untitled" | "remote";
    readonly media: "markdown" | "pdf" | "other";
    readonly publishedAt?: string;
    readonly title?: string;
  };
  readonly locator: {
    readonly durable?: string;
    readonly markdown?: {
      readonly startLine: number;
      readonly endLine: number;
    };
    readonly pdf?: {
      readonly page: number;
      readonly viewRect?: BridgeViewRect;
    };
  };
  readonly view?: { readonly id: string };
  readonly selection: { readonly text: string; readonly sha256: string };
  readonly revision: {
    readonly documentVersion?: number;
    readonly sourceSha256?: string;
    readonly isDirty: boolean;
  };
  readonly wiki?: BridgeWikiContext;
  /** Unknown top-level fields, preserved so either extension can round-trip. */
  readonly extra?: Readonly<Record<string, unknown>>;
}

export interface MarkdownEnvelopeInput {
  readonly identity: string;
  readonly kind: BridgeEnvelope["source"]["kind"];
  readonly capturedAt: string;
  readonly publishedAt?: string;
  readonly title?: string;
  readonly durable?: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly viewId?: string;
  readonly text: string;
  readonly selectionSha256: string;
  readonly documentVersion?: number;
  readonly sourceSha256?: string;
  readonly isDirty: boolean;
  readonly wiki?: BridgeWikiContext;
}

export interface PdfEnvelopeInput {
  readonly identity: string;
  readonly kind?: "file" | "remote";
  readonly capturedAt: string;
  readonly publishedAt?: string;
  readonly title?: string;
  readonly page: number;
  readonly viewRect?: BridgeViewRect;
  readonly viewId?: string;
  readonly text: string;
  readonly selectionSha256: string;
  readonly documentVersion?: number;
  readonly sourceSha256?: string;
  readonly isDirty: boolean;
}

export type EnvelopeParse =
  | { readonly ok: true; readonly envelope: BridgeEnvelope }
  | { readonly ok: false; readonly reason: string };
