/**
 * PDF Workshop's desktop-only plugins, kept out of the browser build. They
 * hand selections to agents that read local files:
 *
 *   pdfRegions   PNG snapshots of selected regions, for agents
 *   agentBridge  Copy Link for Agent, the selection envelope command, the AgentHandoff service, the opt-in MCP server
 */
import type { Plugin } from "@workshop/core";
import { agentBridgePlugin } from "./plugins/agentBridge/plugin";
import { pdfRegionsPlugin } from "./plugins/pdfRegions/plugin";

export const pdfDesktopPlugins: readonly Plugin[] = [
  pdfRegionsPlugin,
  agentBridgePlugin,
];
