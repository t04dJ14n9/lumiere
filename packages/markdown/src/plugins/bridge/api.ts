import type {
  BridgeEnvelope,
  BridgeWikiContext,
} from "../../shared/bridge/envelope";

export interface MarkdownHandoff {
  /** LLM Wiki clipboard text. Present only when the note is saved. */
  readonly text?: string;
  readonly envelope: BridgeEnvelope;
}

export interface BridgeCapture {
  /**
   * The active Markdown selection. Dirty and untitled notes still produce an
   * envelope (`revision.isDirty`, no whole-source hash). `text` is the LLM
   * Wiki clipboard form only when the note has a durable locator and is saved.
   */
  markdownSelection(
    wiki?: BridgeWikiContext,
  ): Promise<MarkdownHandoff | undefined>;
  /**
   * Markdown first. When this editor has no selection, asks Agent PDF Viewer
   * if `vscodeEmbedPdf.bridge.envelope` is registered. Missing PDF support
   * returns undefined and does not throw.
   */
  activeSelection(
    wiki?: BridgeWikiContext,
  ): Promise<BridgeEnvelope | undefined>;
}

declare module "@workshop/core" {
  interface Services {
    bridgeCapture: BridgeCapture;
  }
}
