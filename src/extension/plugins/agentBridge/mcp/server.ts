/**
 * Agent bridge server: a local MCP server (Streamable HTTP on 127.0.0.1,
 * random port, bearer token) that hands the live PDF / note selection to
 * coding agents. It is announced to:
 *
 *   VS Code (Copilot Chat)  vscode.lm.registerMcpServerDefinitionProvider
 *   Cursor                  vscode.cursor.mcp.registerServer (Cursor ignores the VS Code API)
 *   Claude Code, Codex      a discovery file read by the stdio shim
 *                           (`claude mcp add` / `codex mcp add` -- node <shim>)
 *
 * `controller.ts` decides when it runs.
 *
 * Invariant: everything `startAgentBridge` sets up (the HTTP server, the
 * discovery file, the editor registrations) is undone by the returned
 * disposable, and by nothing else; if it fails part way, what it set up so
 * far is undone before the error propagates.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile, copyFile } from 'node:fs/promises';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { PdfPanels } from '../../pdf/panels';
import type { AgentHandoff } from '../handoff';
import { DISCOVERY_DIR, PROVIDER_ID, SERVER_NAME, type BridgeInfo } from './constants';
import { createBridgeServer, LastPdf } from './tools';

export interface RunningBridge extends vscode.Disposable {
  info: BridgeInfo;
}

export interface ServerOptions {
  extensionUri: vscode.Uri;
  /** Where the stable copy of the stdio shim goes. */
  shim: string;
  panels: PdfPanels;
  handoff: AgentHandoff;
  log: vscode.LogOutputChannel;
}

export async function startAgentBridge(options: ServerOptions): Promise<RunningBridge> {
  // Undone in reverse if a later step fails; handed to the caller on success.
  const undo: vscode.Disposable[] = [];
  try {
    return await listen(options, undo);
  } catch (error) {
    for (const step of undo.reverse()) step.dispose();
    throw error;
  }
}

async function listen(options: ServerOptions, undo: vscode.Disposable[]): Promise<RunningBridge> {
  const { panels, handoff, log, shim } = options;
  const lastPdf = new LastPdf(panels);
  undo.push(lastPdf);
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
      const server = createBridgeServer(lastPdf, handoff);
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
  undo.push(new vscode.Disposable(() => httpServer.close()));
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
  undo.push(new vscode.Disposable(() => void rm(discoveryFile, { force: true })));
  await writeFile(discoveryFile, JSON.stringify(info, null, 2), { mode: 0o600 });

  // A stable copy of the shim, so `claude mcp add` survives extension updates.
  await mkdir(path.dirname(shim), { recursive: true });
  await copyFile(vscode.Uri.joinPath(options.extensionUri, 'dist', 'bridge-stdio.js').fsPath, shim).catch(error =>
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

  undo.push(...registrations);
  const disposable = vscode.Disposable.from(...undo.splice(0).reverse());
  return { info, dispose: () => disposable.dispose() };
}
