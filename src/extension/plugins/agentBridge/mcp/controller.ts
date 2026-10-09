/**
 * Agent bridge controller: decides when the local MCP server runs. It is
 * light on purpose; the server, the MCP SDK and zod live in a bundle of
 * their own (dist/agent-bridge-server.js) that is loaded only when the
 * server starts.
 *
 * Invariant: the server runs only while `vscodeEmbedPdf.agentBridge.enabled`
 * is on AND it has been used in this window: a PDF editor was opened, or the
 * user ran Copy MCP Setup. Turning the setting off stops it at once, without
 * a reload; starts and stops run one at a time, in order.
 *
 * Invariant: the returned `dispose()` resolves only after the bridge has
 * fully stopped (see server.ts): a start still in progress is finished or
 * abandoned and undone first, and a start that has not yet opened its
 * listener never opens it.
 */
import * as vscode from 'vscode';
import type { PdfPanels } from '../../pdf/panels';
import type { AgentHandoff } from '../handoff';
import { SERVER_NAME } from './constants';
import type { BridgeLog, RunningBridge } from './server';

/** Whether the user has turned the bridge on. Off by default: it starts a local server. */
export function agentBridgeEnabled(): boolean {
  return vscode.workspace.getConfiguration('vscodeEmbedPdf').get<boolean>('agentBridge.enabled', false) === true;
}

export interface BridgeOptions {
  extensionUri: vscode.Uri;
  globalStorageUri: vscode.Uri;
  panels: PdfPanels;
  handoff: AgentHandoff;
  log: BridgeLog;
  /** See ServerOptions.discoveryDir. */
  discoveryDir?: string;
  shutdownGraceMs?: number;
}

/** The running controller; `dispose()` is awaited by the plugin runtime. */
export interface AgentBridgeController {
  dispose(): Promise<void>;
}

/** Runs the bridge (see the invariants above) and registers Copy MCP Setup. */
export function registerAgentBridge(options: BridgeOptions): AgentBridgeController {
  const { panels, log } = options;
  const shim = vscode.Uri.joinPath(options.globalStorageUri, 'bridge-stdio.js').fsPath;
  let running: RunningBridge | undefined;
  // Used: a PDF editor was opened in this window, or Copy MCP Setup was run.
  // Once used, the bridge stays up until the setting goes off, so an agent
  // that connected does not lose it when the last PDF closes.
  let used = panels.all.length > 0;
  let stopped = false;
  let queue = Promise.resolve();
  const wanted = (): boolean => !stopped && used && agentBridgeEnabled();
  const start = async (): Promise<void> => {
    const { startAgentBridge } = await import('./server');
    // Stopped, or turned off, while the server code loaded: do not listen.
    if (!wanted()) return;
    const bridge = await startAgentBridge({ ...options, shim });
    // The setting may have changed, or the plugin stopped, while it started.
    if (wanted()) running = bridge;
    else await bridge.dispose();
  };
  const stop = async (bridge: RunningBridge): Promise<void> => {
    running = undefined;
    await bridge.dispose();
    log.info('Agent bridge stopped');
  };
  /** Queue one step towards the wanted state; the queue never rejects. */
  const sync = (): Promise<void> => {
    queue = queue.then(async () => {
      if (wanted() && !running) {
        await start().catch(error => log.error(`Agent bridge failed to start: ${String(error)}`));
      } else if (!wanted() && running) {
        await stop(running).catch(error => log.error(`Agent bridge failed to stop: ${String(error)}`));
      }
    });
    return queue;
  };
  void sync();
  const subscriptions = vscode.Disposable.from(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('vscodeEmbedPdf.agentBridge.enabled')) void sync();
    }),
    panels.onDidOpen(() => {
      used = true;
      void sync();
    }),
    vscode.commands.registerCommand('vscodeEmbedPdf.copyMcpSetup', async () => {
      if (!agentBridgeEnabled()) {
        const turnOn = 'Turn On';
        const choice = await vscode.window.showInformationMessage(
          'The agent bridge is off. It serves the PDF selection to coding agents over a local MCP server (127.0.0.1, token-protected). Turn it on?',
          turnOn,
        );
        if (choice !== turnOn) return;
        await vscode.workspace.getConfiguration('vscodeEmbedPdf').update('agentBridge.enabled', true, vscode.ConfigurationTarget.Global);
      }
      used = true;
      void sync();
      await copyMcpSetup(shim);
    }),
  );
  let disposing: Promise<void> | undefined;
  return {
    dispose: () => disposing ??= (async () => {
      stopped = true;
      subscriptions.dispose();
      // Waits for a start in progress, then stops what it started.
      await sync();
    })(),
  };
}

/** Let the user wire Claude Code / Codex (and any stdio MCP client) to the bridge. */
async function copyMcpSetup(shim: string): Promise<void> {
  const node = 'node';
  const options = [
    { label: 'Claude Code', detail: `claude mcp add --scope user ${SERVER_NAME} -- ${node} ${shim}` },
    { label: 'Codex', detail: `codex mcp add ${SERVER_NAME} -- ${node} ${shim}` },
    { label: 'Codex (config.toml)', detail: `[mcp_servers.${SERVER_NAME}]\ncommand = "${node}"\nargs = ["${shim}"]` },
    { label: 'Project .mcp.json (Claude Code)', detail: JSON.stringify({ mcpServers: { [SERVER_NAME]: { command: node, args: [shim] } } }, null, 2) },
  ];
  const picked = await vscode.window.showQuickPick(options, { title: 'Copy MCP setup for…' });
  if (!picked) return;
  await vscode.env.clipboard.writeText(picked.detail);
  void vscode.window.showInformationMessage(`Copied the ${picked.label} MCP setup. Run it in a terminal (or paste it into the config).`);
}
