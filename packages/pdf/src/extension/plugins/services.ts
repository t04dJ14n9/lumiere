import type * as vscode from "vscode";
import type { PdfPanel } from "./pdf/panel";
import type { PdfPanels } from "./pdf/panels";
import type { SelectionSnapshot } from "./pdf/selection";
import type { PdfSettings } from "../settings";
import type { NoteSelections } from "./agentBridge/note-selections";

/**
 * Plugin `pdfRegions` (desktop): saves a region selection's PNG snapshot so
 * an agent can open it; see RegionSnapshots.
 */
export interface RegionSnapshotService {
  save(
    panel: PdfPanel,
    snapshot: SelectionSnapshot | undefined,
    options?: { notify?: boolean },
  ): Promise<vscode.Uri | undefined>;
}

/** Plugin `agentBridge` (desktop): Copy Link for Agent; see AgentHandoff. */
export interface PdfHandoffService {
  copyLinkForAgent(panel: PdfPanel): Promise<boolean>;
}

/**
 * The services PDF plugins share. The extension's composition root provides
 * `extensionContext` and `outputChannel` (shared with Markdown Workshop);
 * each other service is provided by the plugin named beside it.
 */
declare module "@workshop/core" {
  interface Services {
    extensionContext: vscode.ExtensionContext;
    outputChannel: vscode.LogOutputChannel;
    /** Plugin `pdf`: every open PDF editor. */
    pdfPanels: PdfPanels;
    /** Plugin `pdf`: the extension's contributed settings, and writes to them. */
    pdfSettings: PdfSettings;
    /** Plugin `pdfRegions`: PNG snapshots of selected regions. */
    regionSnapshots: RegionSnapshotService;
    /** Plugin `agentBridge`: the text and chat routing of Copy Link for Agent. */
    pdfHandoff: PdfHandoffService;
    /** The composition root: the selection in the Markdown editor, for agents. */
    noteSelections: NoteSelections;
  }
}
