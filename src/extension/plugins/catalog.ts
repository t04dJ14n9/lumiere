/**
 * Every plugin of the extension. The order here is only the tie-break for
 * plugins that do not depend on each other; activation order comes from
 * each manifest's `requires` and `optional` (see runtime/plugin-runtime.ts).
 *
 *   pdf          the viewer: custom editor, open editors, page/zoom/find, Open Location
 *   pdfToolbar   where the controls are: status bar entries, the mode setting
 *   pdfOutline   the PDF Outline view in the Explorer
 *   pdfLookUp    macOS Look Up: a force click or the context menu opens the Dictionary
 *   pdfSettings  PDF: Open Settings and the commands that change the common settings
 *   pdfZen       zen mode: core Zen Mode, and a floating bar with Exit zen in the viewer
 *   pdfRegions   PNG snapshots of selected regions, for agents
 *   agentBridge  Copy Link for Agent, the AgentHandoff service, the opt-in MCP server
 *   ideContext   Copy/Send IDE Context (clipboard-first; never silent-guess)
 */
import { agentBridgePlugin } from './agentBridge/plugin';
import { ideContextPlugin } from './ideContext/plugin';
import { pdfPlugin } from './pdf/plugin';
import { pdfLookUpPlugin } from './pdfLookUp/plugin';
import { pdfSettingsPlugin } from './pdfSettings/plugin';
import { pdfOutlinePlugin } from './pdfOutline/plugin';
import { pdfRegionsPlugin } from './pdfRegions/plugin';
import { pdfToolbarPlugin } from './pdfToolbar/plugin';
import { pdfZenPlugin } from './pdfZen/plugin';
import { pdfHistoryPlugin } from './pdfHistory/plugin';
import type { PluginDefinition, PdfServices } from './services';

export const plugins: readonly PluginDefinition<PdfServices>[] = [
  pdfPlugin,
  pdfHistoryPlugin,
  pdfToolbarPlugin,
  pdfOutlinePlugin,
  pdfRegionsPlugin,
  pdfLookUpPlugin,
  pdfZenPlugin,
  pdfSettingsPlugin,
  agentBridgePlugin,
  ideContextPlugin,
];
