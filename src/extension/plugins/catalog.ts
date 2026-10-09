/**
 * Every plugin of the extension. The order here is only the tie-break for
 * plugins that do not depend on each other; activation order comes from
 * each manifest's `requires` and `optional` (see runtime/plugin-runtime.ts).
 *
 *   pdf          the viewer: custom editor, open editors, page/zoom/find, Open Location
 *   pdfToolbar   where the controls are: status bar entries, the mode setting
 *   pdfOutline   the PDF Outline view in the Explorer
 *   pdfRegions   PNG snapshots of selected regions, for agents
 *   agentBridge  Copy Link for Agent, the AgentHandoff service, the opt-in MCP server
 */
import { agentBridgePlugin } from './agentBridge/plugin';
import { pdfPlugin } from './pdf/plugin';
import { pdfOutlinePlugin } from './pdfOutline/plugin';
import { pdfRegionsPlugin } from './pdfRegions/plugin';
import { pdfToolbarPlugin } from './pdfToolbar/plugin';
import type { PluginDefinition, PdfServices } from './services';

export const plugins: readonly PluginDefinition<PdfServices>[] = [
  pdfPlugin,
  pdfToolbarPlugin,
  pdfOutlinePlugin,
  pdfRegionsPlugin,
  agentBridgePlugin,
];
