import assert from 'node:assert/strict';
import { test } from 'node:test';
// First: everything below imports 'vscode', which this points at the fake.
import './support/install-fake-vscode';
import * as vscode from './support/fake-vscode';
import { plugins } from '../../src/extension/plugins/catalog';
import { CordisPluginRuntime } from '../../src/extension/runtime/cordis-runtime';
import { PluginRuntime } from '../../src/extension/runtime/plugin-runtime';

/**
 * Leave-no-trace tests: each plugin, and the whole catalog, started with a
 * fake VS Code and stopped again must leave no registration behind.
 * Runs under both Stage B host runtimes (native + cordis).
 */
interface HostRuntime {
  start(only?: (id: string) => boolean): Promise<void>;
  enable(id: string): Promise<boolean>;
  disable(id: string): Promise<void>;
  dispose(): Promise<void>;
  state(id: string): string | undefined;
  resources(): Record<string, string[]>;
}

const errors: string[] = [];
const log = { info() {}, warn() {}, error(message: string) { errors.push(message); } };
const memento = () => {
  const values = new Map<string, unknown>();
  return { get: (key: string, fallback?: unknown) => values.get(key) ?? fallback, update: async (key: string, value: unknown) => { values.set(key, value); }, keys: () => [...values.keys()] };
};
const context = {
  globalState: memento(),
  workspaceState: memento(),
  subscriptions: [],
  extensionUri: vscode.Uri.file('/extension'),
  globalStorageUri: vscode.Uri.file('/storage/global'),
  storageUri: vscode.Uri.file('/storage/workspace'),
};

function createRuntime(impl: 'native' | 'cordis'): HostRuntime {
  const root = { context, log } as never;
  return impl === 'cordis'
    ? new CordisPluginRuntime(plugins, log, root)
    : new PluginRuntime(plugins, log, root);
}

for (const impl of ['native', 'cordis'] as const) {
  async function startAndStop(only?: readonly string[]): Promise<string[]> {
    errors.length = 0;
    const runtime = createRuntime(impl);
    await runtime.start(only && (id => only.includes(id)));
    assert.deepEqual(errors, []);
    for (const id of only ?? plugins.map(plugin => plugin.manifest.id)) {
      assert.equal(runtime.state(id), 'active', `${impl}:${id}`);
    }
    const registered = vscode.outstanding();
    await runtime.dispose();
    assert.deepEqual(errors, [], `${impl}: teardown logged errors`);
    assert.deepEqual(runtime.resources(), {});
    assert.deepEqual(vscode.outstanding(), [], `${impl}: registrations left after dispose`);
    return registered;
  }

  for (const plugin of plugins) {
    const id = plugin.manifest.id;
    test(`${impl}/${id}: started alone (with what it requires) and stopped, it leaves no registration`, async () => {
      const required = (name: string): string[] => {
        const manifest = plugins.find(item => item.manifest.id === name)!.manifest;
        return [...manifest.requires.flatMap(required), name];
      };
      const registered = await startAndStop([...new Set(required(id))]);
      assert.ok(registered.length > 0, `${impl}:${id} registered nothing`);
    });
  }

  test(`${impl}/catalog: the whole catalog starts and stops without leaving a registration`, async () => {
    const registered = await startAndStop();
    for (const kind of ['customEditor:pdfWorkshop.viewer', 'command:pdfWorkshop.copyLinkForAgent', 'command:vscodeEmbedPdf.bridge.envelope', 'command:pdfWorkshop.copyMcpSetup']) {
      assert.ok(registered.includes(kind), `${impl}:${kind}`);
    }
  });

  test(`${impl}/toggle: a plugin can be turned off and on again without leaving a registration`, async () => {
    const runtime = createRuntime(impl);
    await runtime.start();
    const all = vscode.outstanding();
    await runtime.disable('pdfOutline');
    assert.ok(!vscode.outstanding().some(kind => kind.startsWith('treeView:')));
    await runtime.enable('pdfOutline');
    assert.deepEqual(vscode.outstanding(), all);
    await runtime.dispose();
    assert.deepEqual(vscode.outstanding(), []);
  });
}

test('the check catches a registration a plugin does not hand to its scope', async () => {
  const leaky = {
    manifest: { id: 'leaky', title: 'Leaky', capabilities: ['commands'], requires: [] },
    activate() {
      vscode.commands.registerCommand('leaky.command');
    },
  };
  const runtime = new PluginRuntime([leaky] as never, log, { context, log } as never);
  await runtime.start();
  await runtime.dispose();
  assert.deepEqual(vscode.outstanding(), ['command:leaky.command']);
  vscode.forgetAll();
});
