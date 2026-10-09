/**
 * Agent bridge: a local MCP server (Streamable HTTP on 127.0.0.1, random
 * port, bearer token) that hands the live PDF / note selection to coding
 * agents. It is announced to:
 *
 *   VS Code (Copilot Chat)  vscode.lm.registerMcpServerDefinitionProvider
 *   Cursor                  vscode.cursor.mcp.registerServer (Cursor ignores the VS Code API)
 *   Claude Code, Codex      a discovery file read by the stdio shim
 *                           (`claude mcp add` / `codex mcp add` -- node <shim>)
 *
 * It is off by default (`vscodeEmbedPdf.agentBridge.enabled`), because it
 * starts a local server; turning the setting on or off starts or stops it
 * without a reload.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile, copyFile } from 'node:fs/promises';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { PdfPanels } from '../pdf-panels';
import { createBridgeServer, LastPdf } from './tools';

export const SERVER_NAME = 'agent-pdf-viewer';
export const PROVIDER_ID = 'vscodeEmbedPdf.agentBridge';
/** Where running bridges announce themselves for the stdio shim. */
export const DISCOVERY_DIR = path.join(os.homedir(), '.agent-pdf-viewer', 'bridges');

export interface BridgeInfo {
  url: string;
  token: string;
  pid: number;
  appName: string;
  workspaceFolders: string[];
  startedAt: string;
}

/** Whether the user has turned the bridge on. Off by default: it starts a local server. */
export function agentBridgeEnabled(): boolean {
  return vscode.workspace.getConfiguration('vscodeEmbedPdf').get<boolean>('agentBridge.enabled', false) === true;
}

/**
 * Runs the bridge while `vscodeEmbedPdf.agentBridge.enabled` is on, and
 * registers Copy MCP Setup, which offers to turn the bridge on when it is off.
 */
export function registerAgentBridge(context: vscode.ExtensionContext, panels: PdfPanels, log: vscode.LogOutputChannel): vscode.Disposable {
  const shim = vscode.Uri.joinPath(context.globalStorageUri, 'bridge-stdio.js').fsPath;
  let running: RunningBridge | undefined;
  let queue = Promise.resolve();
  const sync = (): void => {
    queue = queue.then(async () => {
      const enabled = agentBridgeEnabled();
      if (enabled && !running) running = await startAgentBridge(context, panels, log, shim);
      else if (!enabled && running) {
        running.dispose();
        running = undefined;
        log.info('Agent bridge stopped (vscodeEmbedPdf.agentBridge.enabled is off)');
      }
    }).catch(error => log.error(`Agent bridge failed to start: ${String(error)}`));
  };
  sync();
  return vscode.Disposable.from(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('vscodeEmbedPdf.agentBridge.enabled')) sync();
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
      await copyMcpSetup(shim);
    }),
    new vscode.Disposable(() => running?.dispose()),
  );
}

interface RunningBridge extends vscode.Disposable {
  info: BridgeInfo;
}

async function startAgentBridge(context: vscode.ExtensionContext, panels: PdfPanels, log: vscode.LogOutputChannel, shim: string): Promise<RunningBridge> {
  const lastPdf = new LastPdf(panels);
  const token = randomBytes(24).toString('hex');

  const httpServer = http.createServer((req, res) => void handle(req, res));
  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Loopback only, token required, and no browser origins (DNS rebinding).
    if (req.headers.origin) {
      log.warn(`Agent bridge rejected ${req.method} ${req.url}: Origin ${req.headers.origin}`);
      res.writeHead(403).end();
      return;
    }
    // Token in the Authorization header, or in the path (/mcp/<token>): Cursor 3.24 drops the
    // headers of servers registered through vscode.cursor.mcp.registerServer.
    const pathToken = req.url?.split('?')[0] === `/mcp/${token}`;
    if (req.headers.authorization !== `Bearer ${token}` && !pathToken) {
      log.warn(`Agent bridge rejected ${req.method} ${req.url?.split('/').slice(0, 3).join('/')}: no valid token`);
      // 404 for OAuth discovery probes (/.well-known/...), so clients don't start an OAuth flow.
      res.writeHead(req.url?.startsWith('/mcp') ? 401 : 404).end();
      return;
    }
    if (!req.url?.startsWith('/mcp')) {
      res.writeHead(404).end();
      return;
    }
    try {
      const server = createBridgeServer(lastPdf);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      log.error(`Agent bridge request failed: ${String(error)}`);
      if (!res.headersSent) res.writeHead(500).end();
    }
  }
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = httpServer.address() as AddressInfo;
  const info: BridgeInfo = {
    url: `http://127.0.0.1:${port}/mcp`,
    token,
    pid: process.pid,
    appName: vscode.env.appName,
    workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath),
    startedAt: new Date().toISOString(),
  };
  log.info(`Agent bridge listening on ${info.url}`);

  // Discovery file for the stdio shim (Claude Code, Codex, any MCP client).
  const discoveryFile = path.join(DISCOVERY_DIR, `${port}.json`);
  await mkdir(DISCOVERY_DIR, { recursive: true, mode: 0o700 });
  await writeFile(discoveryFile, JSON.stringify(info, null, 2), { mode: 0o600 });

  // A stable copy of the shim, so `claude mcp add` survives extension updates.
  await mkdir(path.dirname(shim), { recursive: true });
  await copyFile(vscode.Uri.joinPath(context.extensionUri, 'dist', 'bridge-stdio.js').fsPath, shim).catch(error =>
    log.warn(`Could not copy the stdio shim: ${String(error)}`));

  const headers = { Authorization: `Bearer ${token}` };
  const registrations: vscode.Disposable[] = [];
  // Cursor: its own API; vscode.lm.registerMcpServerDefinitionProvider only logs a warning there.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cursorMcp = (vscode as any).cursor?.mcp as { registerServer(config: unknown): void; unregisterServer(name: string): void } | undefined;
  if (cursorMcp) {
    cursorMcp.registerServer({ name: SERVER_NAME, server: { url: `${info.url}/${token}`, headers } });
    registrations.push(new vscode.Disposable(() => cursorMcp.unregisterServer(SERVER_NAME)));
    log.info('Registered with Cursor (vscode.cursor.mcp.registerServer)');
  } else {
    // VS Code (1.101+): the MCP server definition provider API, used by Copilot Chat's agent mode.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lm = (vscode as any).lm as { registerMcpServerDefinitionProvider?(id: string, provider: unknown): vscode.Disposable } | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const HttpDefinition = (vscode as any).McpHttpServerDefinition as (new (label: string, uri: vscode.Uri, headers?: Record<string, string>, version?: string) => unknown) | undefined;
    if (lm?.registerMcpServerDefinitionProvider && HttpDefinition) {
      registrations.push(lm.registerMcpServerDefinitionProvider(PROVIDER_ID, {
        provideMcpServerDefinitions: () => [new HttpDefinition('Agent PDF Viewer', vscode.Uri.parse(info.url), headers, '0.1.0')],
      }));
      log.info('Registered with VS Code (vscode.lm.registerMcpServerDefinitionProvider)');
    }
  }

  const disposable = vscode.Disposable.from(
    lastPdf,
    ...registrations,
    new vscode.Disposable(() => {
      httpServer.close();
      void rm(discoveryFile, { force: true });
    }),
  );
  return { info, dispose: () => disposable.dispose() };
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
