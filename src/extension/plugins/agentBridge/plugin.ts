import * as vscode from 'vscode';
import type { PluginDefinition, PdfServices } from '../services';
import { AGENT_BRIDGE_COMMAND_IDS } from '../pdf/registered-commands';
import { AgentHandoff } from './handoff';
import manifest from './manifest';
import { registerAgentBridge } from './mcp/controller';

/**
 * Everything that hands a selection to an agent: Copy Link for Agent (the
 * command and the viewer's button), the `handoff` service behind it, and the
 * opt-in local MCP server (`pdfWorkshop.agentBridge.enabled`, off by
 * default).
 *
 * Naming: the plugin is `agentBridge`, its service is `AgentHandoff`, and its
 * command is `copyLinkForAgent`; Markdown Workbench uses the same names.
 */
export const agentBridgePlugin: PluginDefinition<PdfServices> = {
  manifest,
  activate(scope) {
    const panels = scope.get('panels');
    const context = scope.get('context');
    const handoff = new AgentHandoff(() => scope.find('regions'));
    scope.acquire(vscode.commands.registerCommand(AGENT_BRIDGE_COMMAND_IDS.copyLinkForAgent, () => {
      const panel = panels.active;
      return panel ? handoff.copyLinkForAgent(panel) : undefined;
    }), 'command');
    scope.acquire(panels.handle('copyLinkForAgent', panel => handoff.copyLinkForAgent(panel)), 'message handler');
    scope.acquire(registerAgentBridge({
      extensionUri: context.extensionUri,
      globalStorageUri: context.globalStorageUri,
      panels,
      handoff,
      log: scope.get('log'),
    }), 'mcp controller');
    scope.provide('handoff', handoff);
  },
};
