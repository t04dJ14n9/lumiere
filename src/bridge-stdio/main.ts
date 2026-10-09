/**
 * stdio <-> HTTP shim for the Agent PDF Viewer bridge, for MCP clients
 * configured with a command (Claude Code, Codex). It finds the bridge of the
 * VS Code / Cursor window whose workspace contains the client's working
 * directory (else the newest one) and forwards JSON-RPC messages to it.
 *
 *     claude mcp add agent-pdf-viewer -- node bridge-stdio.js
 */
import { readdirSync, readFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

const DIR = process.env.AGENT_PDF_BRIDGE_DIR ?? path.join(os.homedir(), '.agent-pdf-viewer', 'bridges');

interface BridgeInfo { url: string; token: string; pid: number; workspaceFolders: string[]; startedAt: string }

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function findBridge(): BridgeInfo | undefined {
  let files: string[] = [];
  try { files = readdirSync(DIR).filter(file => file.endsWith('.json')); } catch { return undefined; }
  const bridges = files.flatMap(file => {
    try { return [JSON.parse(readFileSync(path.join(DIR, file), 'utf8')) as BridgeInfo]; } catch { return []; }
  }).filter(bridge => alive(bridge.pid));
  const cwd = process.cwd();
  const inside = (folder: string): boolean => cwd === folder || cwd.startsWith(folder + path.sep);
  const score = (bridge: BridgeInfo): number => Math.max(0, ...bridge.workspaceFolders.filter(inside).map(folder => folder.length));
  bridges.sort((a, b) => score(b) - score(a) || b.startedAt.localeCompare(a.startedAt));
  return bridges[0];
}

const stdio = new StdioServerTransport();
let http: StreamableHTTPClientTransport | undefined;

async function upstream(): Promise<StreamableHTTPClientTransport> {
  if (http) return http;
  const bridge = findBridge();
  if (!bridge) throw new Error('No running VS Code/Cursor window with Agent PDF Viewer was found.');
  const transport = new StreamableHTTPClientTransport(new URL(bridge.url), {
    requestInit: { headers: { Authorization: `Bearer ${bridge.token}` } },
  });
  transport.onmessage = message => void stdio.send(message);
  transport.onerror = () => { http = undefined; };
  transport.onclose = () => { http = undefined; };
  await transport.start();
  http = transport;
  return transport;
}

stdio.onmessage = (message: JSONRPCMessage) => {
  void (async () => {
    try {
      await (await upstream()).send(message);
    } catch (error) {
      http = undefined;
      if ('id' in message && 'method' in message) {
        await stdio.send({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: String(error instanceof Error ? error.message : error) } });
      }
    }
  })();
};
void stdio.start();
