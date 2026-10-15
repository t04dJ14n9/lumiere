import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
// First: everything below imports 'vscode', which this points at the fake.
import './support/install-fake-vscode';
import * as vscode from './support/fake-vscode';
import { registerAgentBridge } from '../../src/extension/plugins/agentBridge/mcp/controller';
import { routeLabel, startAgentBridge, type ServerOptions } from '../../src/extension/plugins/agentBridge/mcp/server';
import type { AgentHandoff } from '../../src/extension/plugins/agentBridge/handoff';
import type { PdfPanels } from '../../src/extension/plugins/pdf/panels';

/**
 * The real agent bridge server and its controller, over real loopback
 * sockets: the token never reaches the log, and stopping means stopped
 * (no listener, no discovery file, no registration) when dispose resolves.
 */

let folder: string;
let lines: string[];
const log = {
  info: (message: string) => void lines.push(`info ${message}`),
  warn: (message: string) => void lines.push(`warn ${message}`),
  error: (message: string) => void lines.push(`error ${message}`),
};
const noEvent = () => ({ dispose() {} });
const panels = (open: number) => ({ all: Array.from({ length: open }, () => ({})), active: undefined, onDidChange: noEvent, onDidOpen: noEvent }) as unknown as PdfPanels;
const handoff = {} as AgentHandoff;

beforeEach(async () => {
  folder = await mkdtemp(path.join(tmpdir(), 'agent-bridge-'));
  lines = [];
});
afterEach(async () => {
  vscode.configuration.clear();
  vscode.forgetAll();
  await rm(folder, { recursive: true, force: true });
});

function options(extra: Partial<ServerOptions> = {}): ServerOptions {
  return {
    extensionUri: vscode.Uri.file('/nonexistent-extension') as never,
    shim: path.join(folder, 'shim', 'bridge-stdio.js'),
    panels: panels(0),
    handoff,
    log,
    discoveryDir: path.join(folder, 'bridges'),
    shutdownGraceMs: 100,
    ...extra,
  };
}

/** Send raw HTTP and return the status code. */
async function request(port: number, method: string, url: string, headers: Record<string, string> = {}): Promise<number> {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers });
  await response.arrayBuffer();
  return response.status;
}

function portOf(url: string): number {
  return Number(new URL(url).port);
}

/** Whether something accepts connections on the port. */
function listening(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

test('routes are logged as fixed labels, never as the URL', () => {
  assert.equal(routeLabel('/mcp/secret?x=1'), '/mcp');
  assert.equal(routeLabel('/secret'), 'another path');
  assert.equal(routeLabel('/.well-known/oauth/secret'), '/.well-known');
  assert.equal(routeLabel(undefined), 'another path');
});

test('no rejection path writes the token or the Authorization value to the log', async () => {
  const bridge = await startAgentBridge(options());
  const { token } = bridge.info;
  const port = portOf(bridge.info.url);
  const bearer = `Bearer ${token}`;
  try {
    const statuses = [
      // Browser origin, with the token in the path and in the header.
      await request(port, 'POST', `/mcp/${token}`, { Origin: 'http://evil.example' }),
      await request(port, 'POST', '/mcp', { Origin: 'http://evil.example', Authorization: bearer }),
      await request(port, 'GET', `/mcp/${token}?token=${token}`, { Origin: `http://${token}.example` }),
      // No valid token, with the token elsewhere in the URL.
      await request(port, 'POST', `/mcp/${token}x`),
      await request(port, 'POST', `/mcp/x?token=${token}`, { Authorization: `Bearer ${token}x` }),
      await request(port, 'GET', `/${token}`),
      await request(port, 'GET', `/.well-known/${token}`),
      // Valid token, unknown route.
      await request(port, 'GET', `/other/${token}`, { Authorization: bearer }),
    ];
    assert.deepEqual(statuses, [403, 403, 403, 401, 401, 404, 404, 404]);
  } finally {
    await bridge.dispose();
  }
  const logged = lines.join('\n');
  assert.ok(lines.some(line => line.includes('rejected')), logged);
  assert.ok(!logged.includes(token), logged);
  assert.ok(!logged.includes('Bearer'), logged);
});

test('dispose resolves only once the listener is closed, a stalled connection cut and the discovery file removed', async () => {
  const bridge = await startAgentBridge(options());
  const port = portOf(bridge.info.url);
  assert.deepEqual(await readdir(path.join(folder, 'bridges')), [`${port}.json`]);
  assert.equal(vscode.outstanding().filter(kind => kind.startsWith('mcpProvider:')).length, 1);
  // A request in progress: headers sent, body never finished.
  const stalled = net.connect(port, '127.0.0.1');
  await new Promise(resolve => stalled.once('connect', resolve));
  const cut = new Promise(resolve => stalled.once('close', resolve));
  stalled.on('error', () => undefined);
  stalled.write([
    'POST /mcp HTTP/1.1',
    'Host: 127.0.0.1',
    'Accept: application/json, text/event-stream',
    'Content-Type: application/json',
    `Authorization: Bearer ${bridge.info.token}`,
    'Content-Length: 100',
    '',
    '{',
  ].join('\r\n'));
  // Let the server start handling it.
  await new Promise(resolve => setTimeout(resolve, 20));
  await bridge.dispose();
  assert.equal(await listening(port), false);
  assert.deepEqual(await readdir(path.join(folder, 'bridges')), []);
  assert.deepEqual(vscode.outstanding(), []);
  await cut;
  assert.ok(!lines.some(line => line.startsWith('error')), lines.join('\n'));
});

test('a failure after listening (writing the discovery file) closes the listener before the error propagates', async () => {
  // The discovery folder's parent is a file, so creating the folder fails.
  await writeFile(path.join(folder, 'blocker'), '');
  await assert.rejects(startAgentBridge(options({ discoveryDir: path.join(folder, 'blocker', 'bridges') })));
  const url = lines.map(line => /listening on (\S+)/u.exec(line)?.[1]).find(Boolean)!;
  assert.equal(await listening(portOf(url)), false);
  assert.deepEqual(vscode.outstanding(), []);
});

test('a failing cleanup step is logged and does not stop the others; dispose still resolves', async () => {
  const register = vscode.lm.registerMcpServerDefinitionProvider;
  vscode.lm.registerMcpServerDefinitionProvider = () => Object.assign(new vscode.Disposable(), {
    dispose: () => { throw new Error('unregister failed'); },
  }) as never;
  try {
    const bridge = await startAgentBridge(options());
    const port = portOf(bridge.info.url);
    await bridge.dispose();
    assert.equal(await listening(port), false);
    assert.deepEqual(await readdir(path.join(folder, 'bridges')), []);
    assert.ok(lines.includes('error Agent bridge cleanup: unregister failed'), lines.join('\n'));
  } finally {
    vscode.lm.registerMcpServerDefinitionProvider = register;
  }
});

test('the controller disposed while the server starts leaves no listener, file or registration once dispose resolves', async () => {
  vscode.configuration.set('pdfWorkshop.agentBridge.enabled', true);
  const controller = registerAgentBridge({
    extensionUri: vscode.Uri.file('/nonexistent-extension') as never,
    globalStorageUri: vscode.Uri.file(folder) as never,
    panels: panels(1),
    handoff,
    log,
    discoveryDir: path.join(folder, 'bridges'),
    shutdownGraceMs: 100,
  });
  // The start is queued (loading the server code); stop before it listens.
  await controller.dispose();
  assert.deepEqual(await readdir(folder).then(names => names.filter(name => name === 'bridges')), []);
  assert.deepEqual(vscode.outstanding(), []);
  assert.ok(!lines.some(line => line.includes('listening')), lines.join('\n'));
});

test('the controller disposed while the bridge runs waits for it to stop', async () => {
  vscode.configuration.set('pdfWorkshop.agentBridge.enabled', true);
  const controller = registerAgentBridge({
    extensionUri: vscode.Uri.file('/nonexistent-extension') as never,
    globalStorageUri: vscode.Uri.file(folder) as never,
    panels: panels(1),
    handoff,
    log,
    discoveryDir: path.join(folder, 'bridges'),
    shutdownGraceMs: 100,
  });
  // Wait until it is running.
  for (let i = 0; i < 200 && !lines.some(line => line.includes('Registered with VS Code')); i++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const url = lines.map(line => /listening on (\S+)/u.exec(line)?.[1]).find(Boolean)!;
  await controller.dispose();
  assert.equal(await listening(portOf(url)), false);
  assert.deepEqual(await readdir(path.join(folder, 'bridges')), []);
  assert.deepEqual(vscode.outstanding(), []);
  assert.ok(lines.includes('info Agent bridge stopped'), lines.join('\n'));
});

test('a registration error quoting the token is scrubbed from the startup error and every log line', async () => {
  const register = vscode.lm.registerMcpServerDefinitionProvider;
  let token = '';
  vscode.lm.registerMcpServerDefinitionProvider = ((_id: string, provider: { provideMcpServerDefinitions(): vscode.McpHttpServerDefinition[] }) => {
    const [definition] = provider.provideMcpServerDefinitions();
    token = definition!.headers.Authorization!.replace('Bearer ', '');
    // An adapter that quotes what it was given.
    throw new Error(`rejected ${definition!.headers.Authorization}`);
  }) as never;
  try {
    const error = await startAgentBridge(options()).then(() => undefined, (failure: unknown) => failure);
    assert.ok(token.length === 48, 'the adapter saw the token');
    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes(token), error.message);
    assert.match(error.message, /rejected Bearer <token>/);
    assert.ok(lines.every(line => !line.includes(token)), lines.join('\n'));
  } finally {
    vscode.lm.registerMcpServerDefinitionProvider = register;
  }
});
