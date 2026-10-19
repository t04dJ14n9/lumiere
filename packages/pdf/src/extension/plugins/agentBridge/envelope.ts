/**
 * `vscodeEmbedPdf.bridge.envelope`: the PDF selection as a Workbench v1
 * envelope. Copy Link for Agent does not go through this; its clipboard
 * text stays the source-link format.
 *
 * Lumière is the aggregator: it returns a Markdown selection when
 * it has one, otherwise it calls this command. This publisher does not call
 * Workshop back, so the two cannot recurse. A missing selection returns
 * `undefined`.
 */
import { createHash } from "node:crypto";
import type { PdfPanel } from "../pdf/panel";
import {
  selectionCanonical,
  type PdfBridgeEnvelope,
} from "../../../shared/bridge-envelope";
import type { PdfSelection } from "../../../shared/selection";

/** SHA-256 of the selection only. Not the hash of the PDF bytes. */
export function hashSelection(selection: PdfSelection): string {
  return createHash("sha256")
    .update(selectionCanonical(selection))
    .digest("hex");
}

export interface EnvelopeCommandHost {
  panel(): PdfPanel | undefined;
}

export interface PdfEnvelopeSource {
  envelope(panel: PdfPanel): Promise<PdfBridgeEnvelope | undefined>;
}

export class PdfEnvelopePublisher {
  constructor(
    private readonly source: PdfEnvelopeSource,
    private readonly commands: EnvelopeCommandHost,
  ) {}

  async publish(): Promise<PdfBridgeEnvelope | undefined> {
    const panel = this.commands.panel();
    if (!panel) {
      return undefined;
    }
    return this.source.envelope(panel);
  }
}
