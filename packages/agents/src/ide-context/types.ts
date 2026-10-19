export interface IdeContextCaps {
  maxSelectedChars: number;
  maxDiagnosticItems: number;
  maxDiagnosticMessageChars: number;
  maxTabUris: number;
  maxClipboardChars: number;
  maxJsonChars: number;
  maxUriChars: number;
  maxWorkspaceNameChars: number;
  maxDiagnosticSourceChars: number;
  maxDiagnosticCodeChars: number;
  maxCiteMarkdownChars: number;
  maxTempPathChars: number;
  maxWarningChars: number;
  maxWarnings: number;
  maxPdfSelectedChars: number;
  maxPdfSelectionRects: number;
}

export interface PdfRect {
  /** Display page is 1-based; geometry is in PDF points. */
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PdfSelectionWire =
  | { kind: "none" }
  | {
      kind: "text";
      text: string;
      truncated: boolean;
      rects?: PdfRect[];
      rectsTruncated?: boolean;
    }
  | {
      kind: "region";
      rects: PdfRect[];
      rectsTruncated: boolean;
      regionImagePath?: string;
    };

export interface ActiveResource {
  uri: string;
  languageId?: string;
  isDirty?: boolean;
  caret?: { line: number; character: number };
  /** Text-document source offsets only; PDF selections live under pdf.selection. */
  selection?: {
    from: number;
    to: number;
    startLine: number;
    endLine: number;
    text: string;
    truncated: boolean;
  };
}

export interface DiagnosticItem {
  severity: "error" | "warning" | "information" | "hint";
  message: string;
  startLine: number;
  startCharacter: number;
  endLine?: number;
  endCharacter?: number;
  source?: string;
  code?: string | number;
}

export interface MarkdownContext {
  editorKind: "livePreview" | "text" | "unknown";
  panelId?: string;
}

export interface PdfContext {
  uri: string;
  page?: number;
  pageCount?: number;
  selection: PdfSelectionWire;
  viewrect?: { x: number; y: number; w: number; h: number };
  sourceSha256?: string;
  citeMarkdown?: string;
}

export interface IdeContextPacketBase {
  version: 1;
  collectedAt: string;
  workspace?: { name?: string; folderCount: number };
  active?: ActiveResource;
  tabs: { visible: string[]; open: string[]; truncated: boolean };
  diagnostics: { uri: string; items: DiagnosticItem[]; truncated: boolean };
  warnings: string[];
  caps: IdeContextCaps;
}

export type IdeContextPacket = IdeContextPacketBase &
  (
    | { product: "markdownWorkshop"; markdown: MarkdownContext; pdf?: never }
    | { product: "pdfWorkshop"; pdf: PdfContext; markdown?: never }
  );

/** Emit-time product/URI checks, not a validator for untrusted webview messages. */
export function assertPacketInvariants(packet: IdeContextPacket): void {
  if (packet.product === "markdownWorkshop") {
    if (!packet.markdown || packet.pdf !== undefined) {
      throw new Error("MW requires markdown and forbids pdf");
    }
  } else if (packet.product === "pdfWorkshop") {
    assertPdfInvariants(packet);
  } else {
    throw new Error("Unknown IDE context product");
  }
  if (packet.active && packet.diagnostics.uri !== packet.active.uri) {
    throw new Error("diagnostics.uri must equal active.uri");
  }
}

function assertPdfInvariants(packet: IdeContextPacket): void {
  if (!packet.pdf || packet.markdown !== undefined || !packet.pdf.selection) {
    throw new Error("PDF requires pdf.selection and forbids markdown");
  }
  if (packet.active && packet.active.uri !== packet.pdf.uri) {
    throw new Error("PDF active.uri must equal pdf.uri");
  }
  if (packet.active?.selection !== undefined) {
    throw new Error("PDF selection belongs under pdf.selection");
  }
}
