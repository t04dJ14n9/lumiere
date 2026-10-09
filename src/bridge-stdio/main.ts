/**
 * stdio <-> HTTP shim for the Agent PDF Viewer bridge, for MCP clients
 * configured with a command (Claude Code, Codex). It forwards JSON-RPC
 * messages to the bridge of the window whose workspace contains the
 * client's working directory, or to the one named by AGENT_PDF_BRIDGE_PID;
 * see discovery.ts for how (and when it refuses to) choose.
 *
 *     claude mcp add agent-pdf-viewer -- node bridge-stdio.js
 */
import { readdirSync, readFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { chooseBridge, parseBridgeRecord, type BridgeRecord } from './discovery';

const DIR = process.env.AGENT_PDF_BRIDGE_DIR ?? path.join(os.homedir(), '.agent-pdf-viewer', 'bridges');

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function readRecords(): BridgeRecord[] {
  let files: string[] = [];
  try { files = readdirSync(DIR).filter(file => file.endsWith('.json')); } catch { return []; }
  return files.flatMap(file => {
    try {
      const record = parseBridgeRecord(JSON.parse(readFileSync(path.join(DIR, file), 'utf8')));
      return record ? [record] : [];
    } catch {
      return [];
    }
  });
}

const stdio = new StdioServerTransport();
let http: StreamableHTTPClientTransport | undefined;

async function upstream(): Promise<StreamableHTTPClientTransport> {
  if (http) return http;
  const choice = chooseBridge(readRecords(), { cwd: process.cwd(), alive, pid: process.env.AGENT_PDF_BRIDGE_PID });
  if ('error' in choice) throw new Error(choice.error);
  const { bridge } = choice;
  const transport = new StreamableHTTPClientTransport(new URL(bridge.url), {
    requestInit: { headers: { Authorization: `Bearer ${bridge.token}` } },
  });
  transport.onmessage = message => {
    stdio.send(message).catch(report);
  };
  transport.onerror = () => { http = undefined; };
  transport.onclose = () => { http = undefined; };
  await transport.start();
  http = transport;
  return transport;
}

/** Detached work's error sink: stderr, which MCP clients show as the server's log. */
function report(error: unknown): void {
  process.stderr.write(`agent-pdf-viewer bridge: ${error instanceof Error ? error.message : String(error)}\n`);
}

stdio.onmessage = (message: JSONRPCMessage) => {
  (async () => {
    try {
      await (await upstream()).send(message);
    } catch (error) {
      http = undefined;
      if ('id' in message && 'method' in message) {
        await stdio.send({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: String(error instanceof Error ? error.message : error) } });
      }
    }
  })().catch(report);
};
stdio.start().catch(error => {
  report(error);
  process.exitCode = 1;
});
