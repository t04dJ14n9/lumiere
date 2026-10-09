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
 * Invariants:
 *
 * - Everything `startAgentBridge` sets up (the HTTP server and its
 *   connections, the discovery file, the editor registrations) is undone by
 *   the returned `dispose()`, and by nothing else. `dispose()` resolves only
 *   when that is done: the listener is closed (connections still open after
 *   a grace period are cut), requests in progress have finished or been cut
 *   off, and the discovery file is gone. A failing step is logged and does
 *   not stop the others.
 * - If starting fails part way, what it set up so far is undone (and
 *   awaited) before the error propagates.
 * - The token never reaches the log: request URLs are logged as a fixed
 *   route label, and every logged line is scrubbed of the token.
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

/** How long open connections get to finish when the bridge stops. */
const SHUTDOWN_GRACE_MS = 2000;

export interface RunningBridge {
  info: BridgeInfo;
  /** Undo everything; resolves when it is undone (see the invariants). */
  dispose(): Promise<void>;
}

export interface BridgeLog {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface ServerOptions {
  extensionUri: vscode.Uri;
  /** Where the stable copy of the stdio shim goes. */
  shim: string;
  panels: PdfPanels;
  handoff: AgentHandoff;
  log: BridgeLog;
  /** Where to announce the bridge for the stdio shim; tests use a temp folder. */
  discoveryDir?: string;
  shutdownGraceMs?: number;
}

/** One step of undo; may be async, and is awaited. */
type Undo = () => unknown;

export async function startAgentBridge(options: ServerOptions): Promise<RunningBridge> {
  // Undone in reverse if a later step fails; handed to the caller on success.
  const undo: Undo[] = [];
  try {
    return await listen(options, undo);
  } catch (error) {
    for (const failure of await undoAll(undo)) options.log.error(`Agent bridge rollback: ${describe(failure)}`);
    throw error;
  }
}

/** Run every step, last first, awaiting each; returns the errors. */
async function undoAll(steps: Undo[]): Promise<unknown[]> {
  const errors: unknown[] = [];
  for (const step of steps.splice(0).reverse()) {
    try {
      await step();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

/**
 * The route a request asked for, as a fixed label: never the URL itself,
 * which carries the token for Cursor (/mcp/<token>).
 */
export function routeLabel(url: string | undefined): string {
  const first = (url ?? '').split(/[/?#]/u)[1];
  if (first === 'mcp') return '/mcp';
  if (first === '.well-known') return '/.well-known';
  return 'another path';
}

async function listen(options: ServerOptions, undo: Undo[]): Promise<RunningBridge> {
  const { panels, handoff, shim } = options;
  const discoveryDir = options.discoveryDir ?? DISCOVERY_DIR;
  const token = randomBytes(24).toString('hex');
  const scrub = (text: string): string => text.replaceAll(token, '<token>');
  const log: BridgeLog = {
    info: message => options.log.info(scrub(message)),
    warn: message => options.log.warn(scrub(message)),
    error: message => options.log.error(scrub(message)),
  };
  const lastPdf = new LastPdf(panels);
  undo.push(() => lastPdf.dispose());

  const requests = new Set<Promise<void>>();
  const httpServer = http.createServer((req, res) => {
    const request = handle(req, res).catch(error => log.error(`Agent bridge request failed: ${describe(error)}`));
    requests.add(request);
    void request.finally(() => requests.delete(request));
  });
  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const route = routeLabel(req.url);
    // Loopback only, token required, and no browser origins (DNS rebinding).
    if (req.headers.origin) {
      log.warn(`Agent bridge rejected ${req.method} ${route}: requests from a browser origin are not served`);
      res.writeHead(403).end();
      return;
    }
    // Token in the Authorization header, or in the path (/mcp/<token>): Cursor 3.24 drops the
    // headers of servers registered through vscode.cursor.mcp.registerServer.
    const pathToken = req.url?.split('?')[0] === `/mcp/${token}`;
    if (req.headers.authorization !== `Bearer ${token}` && !pathToken) {
      log.warn(`Agent bridge rejected ${req.method} ${route}: no valid token`);
      // 404 for OAuth discovery probes (/.well-known/...), so clients don't start an OAuth flow.
      res.writeHead(route === '/mcp' ? 401 : 404).end();
      return;
    }
    if (route !== '/mcp') {
      res.writeHead(404).end();
      return;
    }
    try {
      const server = createBridgeServer(lastPdf, handoff);
      const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true }); // no session id: stateless
      res.on('close', () => {
        transport.close().catch(error => log.warn(`Agent bridge transport close: ${describe(error)}`));
        server.close().catch(error => log.warn(`Agent bridge server close: ${describe(error)}`));
      });
      // The SDK's own types disagree under exactOptionalPropertyTypes
      // (its transport's optional callbacks); the object is the SDK's.
      await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
      await transport.handleRequest(req, res);
    } catch (error) {
      log.error(`Agent bridge request failed: ${describe(error)}`);
      if (!res.headersSent) res.writeHead(500).end();
    }
  }
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  undo.push(() => closeServer(httpServer, requests, options.shutdownGraceMs ?? SHUTDOWN_GRACE_MS));
  const { port } = httpServer.address() as AddressInfo;
  const info: BridgeInfo = {
    url: `http://127.0.0.1:${port}/mcp`,
    token,
    pid: process.pid,
    appName: vscode.env.appName,
    workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath),
    startedAt: new Date().toISOString(),
  };
  log.info(`Agent bridge listening on ${info.url} (AGENT_PDF_BRIDGE_PID ${info.pid} picks this window)`);

  // Discovery file for the stdio shim (Claude Code, Codex, any MCP client).
  const discoveryFile = path.join(discoveryDir, `${port}.json`);
  await mkdir(discoveryDir, { recursive: true, mode: 0o700 });
  undo.push(() => rm(discoveryFile, { force: true }));
  await writeFile(discoveryFile, JSON.stringify(info, null, 2), { mode: 0o600 });

  // A stable copy of the shim, so `claude mcp add` survives extension updates.
  try {
    await mkdir(path.dirname(shim), { recursive: true });
    await copyFile(vscode.Uri.joinPath(options.extensionUri, 'dist', 'bridge-stdio.js').fsPath, shim);
  } catch (error) {
    log.warn(`Could not copy the stdio shim: ${describe(error)}`);
  }

  const headers = { Authorization: `Bearer ${token}` };
  // Cursor: its own API; vscode.lm.registerMcpServerDefinitionProvider only logs a warning there.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cursorMcp = (vscode as any).cursor?.mcp as { registerServer(config: unknown): void; unregisterServer(name: string): void } | undefined;
  if (cursorMcp) {
    cursorMcp.registerServer({ name: SERVER_NAME, server: { url: `${info.url}/${token}`, headers } });
    undo.push(() => cursorMcp.unregisterServer(SERVER_NAME));
    log.info('Registered with Cursor (vscode.cursor.mcp.registerServer)');
  } else {
    // VS Code (1.101+): the MCP server definition provider API, used by Copilot Chat's agent mode.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lm = (vscode as any).lm as { registerMcpServerDefinitionProvider?(id: string, provider: unknown): vscode.Disposable } | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const HttpDefinition = (vscode as any).McpHttpServerDefinition as (new (label: string, uri: vscode.Uri, headers?: Record<string, string>, version?: string) => unknown) | undefined;
    if (lm?.registerMcpServerDefinitionProvider && HttpDefinition) {
      const registration = lm.registerMcpServerDefinitionProvider(PROVIDER_ID, {
        provideMcpServerDefinitions: () => [new HttpDefinition('Agent PDF Viewer', vscode.Uri.parse(info.url), headers, '0.1.0')],
      });
      undo.push(() => registration.dispose());
      log.info('Registered with VS Code (vscode.lm.registerMcpServerDefinitionProvider)');
    }
  }

  const steps = undo.splice(0);
  let stopping: Promise<void> | undefined;
  return {
    info,
    dispose: () => stopping ??= (async () => {
      for (const failure of await undoAll(steps)) log.error(`Agent bridge cleanup: ${describe(failure)}`);
    })(),
  };
}

/**
 * Stop listening and wait until the server has closed: idle connections go
 * at once, busy ones get `graceMs` to finish and are then cut. Requests in
 * progress are awaited too (bounded by the same grace period plus the cut).
 */
async function closeServer(server: http.Server, requests: Set<Promise<void>>, graceMs: number): Promise<void> {
  const closed = new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
  server.closeIdleConnections();
  if (await within(Promise.all([closed, ...requests]), graceMs)) return;
  server.closeAllConnections();
  await closed;
  await within(Promise.all([...requests]), graceMs);
}

/** Whether `promise` settled within `ms`; its rejection propagates. */
async function within(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
