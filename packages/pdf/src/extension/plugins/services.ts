import type * as vscode from 'vscode';
import type { AgentHandoff } from './agentBridge/handoff';
import type { PdfPanels } from './pdf/panels';
import type { RegionSnapshots } from './pdfRegions/region-snapshots';

/**
 * The services plugins share, by name. The root provides `context` and
 * `log`; each other service is published by one plugin when it commits.
 */
export interface PdfServices {
  context: vscode.ExtensionContext;
  log: vscode.LogOutputChannel;
  /** Plugin `pdf`: every open PDF editor. */
  panels: PdfPanels;
  /** Plugin `pdfRegions`: PNG snapshots of selected regions. */
  regions: RegionSnapshots;
  /** Plugin `agentBridge`: the text and chat routing of Copy Link for Agent. */
  handoff: AgentHandoff;
}

export type { PluginDefinition, PluginHostScope, PluginScope } from '../runtime/plugin-runtime';
