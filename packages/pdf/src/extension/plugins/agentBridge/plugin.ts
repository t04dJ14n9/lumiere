import * as vscode from "vscode";
import type { Plugin } from "@workshop/core";
import type {} from "../services";
import { AGENT_BRIDGE_COMMAND_IDS } from "../pdf/registered-commands";
import { PdfEnvelopePublisher } from "./envelope";
import { AgentHandoff } from "./handoff";
import { LastPdf } from "./last-pdf";
import manifest from "./manifest";
import { registerAgentBridge } from "./mcp/controller";

/**
 * Everything that hands a selection to an agent: Copy Link for Agent (the
 * webview context-menu command), the `handoff` service behind it, and the
 * opt-in local MCP server (`lumiere.pdf.agentBridge.enabled`, off by
 * default).
 *
 * Naming: the plugin is `agentBridge`, its service is `AgentHandoff`, and its
 * clipboard command is `copyLinkForAgent`; Lumière uses the same
 * names. `vscodeEmbedPdf.bridge.envelope` is the Workbench v1 selection
 * envelope (docs/bridge-envelope.md), separate from that clipboard text.
 */
export const agentBridgePlugin: Plugin = {
  name: manifest.id,
  inject: {
    required: ["pdfPanels", "extensionContext", "outputChannel"],
    optional: ["regionSnapshots", "noteSelections"],
  },
  provides: ["pdfHandoff"],
  apply(ctx) {
    const panels = ctx.pdfPanels;
    const context = ctx.extensionContext;
    const handoff = new AgentHandoff(() => ctx.regionSnapshots);
    const lastPdf = ctx.own(new LastPdf(panels), "last pdf");
    const envelopes = new PdfEnvelopePublisher(handoff, {
      panel: () => lastPdf.panel,
    });
    ctx.own(
      vscode.commands.registerCommand(
        AGENT_BRIDGE_COMMAND_IDS.copyLinkForAgent,
        () => {
          const panel = panels.active;
          return panel ? handoff.copyLinkForAgent(panel) : undefined;
        },
      ),
      "command",
    );
    ctx.own(
      vscode.commands.registerCommand(AGENT_BRIDGE_COMMAND_IDS.envelope, () => {
        return envelopes.publish();
      }),
      "command",
    );
    ctx.own(
      panels.handle("copyLinkForAgent", (panel) =>
        handoff.copyLinkForAgent(panel),
      ),
      "message handler",
    );
    ctx.own(
      registerAgentBridge({
        extensionUri: context.extensionUri,
        globalStorageUri: context.globalStorageUri,
        panels,
        lastPdf,
        handoff,
        ...(ctx.noteSelections && { notes: ctx.noteSelections }),
        log: ctx.outputChannel,
      }),
      "mcp controller",
    );
    ctx.provide("pdfHandoff", handoff);
  },
};
