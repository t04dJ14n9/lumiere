import type * as vscode from "vscode";
import type { AgentHandoff } from "./agentBridge/handoff";
import type { PdfPanels } from "./pdf/panels";
import type { RegionSnapshots } from "./pdfRegions/region-snapshots";
import type { PdfSettings } from "../settings";
import type { NoteSelections } from "./agentBridge/note-selections";

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
    regionSnapshots: RegionSnapshots;
    /** Plugin `agentBridge`: the text and chat routing of Copy Link for Agent. */
    pdfHandoff: AgentHandoff;
    /** The composition root: the selection in the Markdown editor, for agents. */
    noteSelections: NoteSelections;
  }
}
