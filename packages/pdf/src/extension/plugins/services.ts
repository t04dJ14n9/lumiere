import type * as vscode from "vscode";
import type { AgentHandoff } from "./agentBridge/handoff";
import type { PdfPanels } from "./pdf/panels";
import type { RegionSnapshots } from "./pdfRegions/region-snapshots";

/**
 * The services PDF plugins share. The extension root provides
 * `extensionContext` and `pdfLog`; each other service is provided by the
 * plugin named beside it.
 */
declare module "@workshop/core" {
  interface Services {
    extensionContext: vscode.ExtensionContext;
    pdfLog: vscode.LogOutputChannel;
    /** Plugin `pdf`: every open PDF editor. */
    pdfPanels: PdfPanels;
    /** Plugin `pdfRegions`: PNG snapshots of selected regions. */
    regionSnapshots: RegionSnapshots;
    /** Plugin `agentBridge`: the text and chat routing of Copy Link for Agent. */
    pdfHandoff: AgentHandoff;
  }
}
