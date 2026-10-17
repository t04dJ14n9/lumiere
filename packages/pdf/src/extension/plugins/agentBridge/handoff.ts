import * as vscode from "vscode";
import type { AgentTarget } from "../../../shared/agent-target";
import { agentText } from "../../../shared/agent-text";
import {
  pdfBridgeEnvelope,
  type PdfBridgeEnvelope,
} from "../../../shared/bridge-envelope";
import type { PdfSelection } from "../../../shared/selection";
import type { PdfPanel } from "../pdf/panel";
import { displayPath } from "../pdf/source";
import type { RegionSnapshots } from "../pdfRegions/region-snapshots";
import { openAgentChat } from "./chat";
import { hashSelection } from "./envelope";

/** What to tell the user when the chat could not take the text itself. */
const PASTE_HINTS: Partial<Record<AgentTarget, string>> = {
  codex: "It is attached in Codex: type your question.",
  clipboard: "Paste it into your agent's chat and ask your question.",
};

/** A PDF selection for an agent: see `AgentHandoff.snapshot`. */
export interface AgentSnapshot {
  file: string;
  uri: string;
  sha256: string;
  selectedAt: string;
  selection: PdfSelection;
  agentText: string;
  regionImage?: string;
}

/**
 * The `handoff` service: turns an editor's selection into the text an agent
 * receives (see `shared/agent-text.ts` and docs/agent-handoff-format.md), and
 * hands it over. Copy Link for Agent and the MCP bridge both go through it,
 * so an agent sees the same text either way.
 *
 * Invariant: the text and the SHA-256 in it come from one selection
 * snapshot, taken once; a reload cannot pair a selection with another
 * file's hash (see PdfSelectionState).
 */
export class AgentHandoff {
  constructor(private readonly regions: () => RegionSnapshots | undefined) {}

  /**
   * Copy Link for Agent: copy the selection, then open the agent chat with it
   * typed in (and a region's snapshot attached) so only the question is left
   * to type. Returns whether there was a selection to copy.
   */
  async copyLinkForAgent(panel: PdfPanel): Promise<boolean> {
    const snapshot = await this.snapshot(panel, { notify: true });
    if (!snapshot) {
      void vscode.window.showWarningMessage(
        "Select text or a region in the PDF to copy a link for an agent.",
      );
      return false;
    }
    await vscode.env.clipboard.writeText(snapshot.agentText);
    const image = snapshot.regionImage
      ? vscode.Uri.file(snapshot.regionImage)
      : undefined;
    const target = await openAgentChat(snapshot.agentText, image, panel.uri);
    const paste = PASTE_HINTS[target];
    if (paste) {
      void vscode.window.showInformationMessage(
        `Link and selection copied for agent. ${paste}`,
      );
    }
    return true;
  }

  /**
   * The current selection as a Workbench v1 envelope, without the clipboard.
   * `capturedAt` is the selection time from the snapshot. No selection
   * returns `undefined`.
   */
  async envelope(panel: PdfPanel): Promise<PdfBridgeEnvelope | undefined> {
    const snapshot = await this.snapshot(panel);
    if (!snapshot) {
      return undefined;
    }
    const kind = panel.uri.scheme === "file" ? "file" : "remote";
    return pdfBridgeEnvelope({
      capturedAt: snapshot.selectedAt,
      identity: snapshot.file,
      // URI-safe reopen base — not displayPath, which may contain `#`.
      durableBase: snapshot.uri,
      kind,
      viewId: panel.viewId,
      selection: snapshot.selection,
      selectionSha256: hashSelection(snapshot.selection),
      sourceSha256: snapshot.sha256,
      isDirty: false,
    });
  }

  /**
   * The selection as an agent should see it, without touching the
   * clipboard: the text Copy Link for Agent produces, plus its parts.
   * With `notify`, the user hears why a region has no image (too large for
   * the snapshot limit, or a failed save).
   */
  async snapshot(
    panel: PdfPanel,
    options: { notify?: boolean } = {},
  ): Promise<AgentSnapshot | undefined> {
    const selected = panel.selectionSnapshot();
    if (!selected) {
      return undefined;
    }
    const image = await this.regions()?.save(panel, selected, options);
    const source = { path: displayPath(panel.uri), sha256: selected.sha256 };
    return {
      file: source.path,
      uri: panel.uri.toString(),
      sha256: selected.sha256,
      selectedAt: selected.selectedAt,
      selection: selected.selection,
      agentText: agentText(
        selected.selection,
        source,
        image ? { regionImage: image.fsPath } : {},
      ),
      ...(image ? { regionImage: image.fsPath } : {}),
    };
  }
}
