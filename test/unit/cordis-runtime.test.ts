import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineManifest } from '../../src/extension/runtime/manifest';
import { CordisPluginRuntime } from '../../src/extension/runtime/cordis-runtime';
import type { PluginDefinition } from '../../src/extension/runtime/plugin-runtime';

interface Services {
  a: { name: string };
  b: { name: string };
}

const silent = { info: () => undefined, error: () => undefined };

function resource(log: string[], name: string) {
  return { dispose: () => void log.push(`release ${name}`) };
}

function plugin(
  id: string,
  requires: string[],
  activate: PluginDefinition<Services>['activate'],
  options: { optional?: string[]; provides?: (keyof Services)[] } = {},
): PluginDefinition<Services> {
  return {
    manifest: defineManifest({
      id,
      title: id,
      capabilities: [],
      requires,
      ...(options.optional ? { optional: options.optional } : {}),
      ...(options.provides ? { provides: options.provides } : {}),
    }),
    activate,
  };
}

test('cordis-runtime activates after required providers and publishes on commit', async () => {
  let seenDuringActivation: unknown = 'unset';
  const runtime = new CordisPluginRuntime<Services>([
    plugin('a', [], async (scope) => {
      scope.provide('a', { name: 'a' });
      seenDuringActivation = scope.find('a');
      await Promise.resolve();
    }, { provides: ['a'] }),
    plugin('b', ['a'], (scope) => {
      assert.equal(scope.get('a').name, 'a');
    }),
  ], silent);
  await runtime.start();
  assert.equal(seenDuringActivation, undefined);
  assert.equal(runtime.state('b'), 'active');
  await runtime.dispose();
});

test('cordis-runtime teardown is LIFO and stops optional dependants', async () => {
  const log: string[] = [];
  const runtime = new CordisPluginRuntime<Services>([
    plugin('a', [], (scope) => {
      scope.acquire(resource(log, 'a'));
      scope.provide('a', { name: 'a' });
    }, { provides: ['a'] }),
    plugin('b', [], (scope) => void scope.acquire(resource(log, 'b'))),
    plugin('c', [], (scope) => void scope.acquire(resource(log, 'c')), { optional: ['a'] }),
  ], silent);
  await runtime.start();
  await runtime.disable('a');
  assert.deepEqual(log, ['release c', 'release a']);
  assert.deepEqual(Object.keys(runtime.resources()), ['b']);
  await runtime.dispose();
  assert.deepEqual(runtime.resources(), {});
});

test('cordis-runtime dispose is permanent and joins concurrent callers', async () => {
  const log: string[] = [];
  const hold = (() => {
    let open: () => void = () => undefined;
    const opened = new Promise<void>((resolve) => { open = resolve; });
    return { opened, open };
  })();
  const runtime = new CordisPluginRuntime<Services>([
    plugin('a', [], (scope) => {
      scope.acquire({ dispose: async () => { await hold.opened; log.push('released'); } });
    }),
  ], silent);
  await runtime.start();
  let resolved = 0;
  const first = runtime.dispose().then(() => resolved++);
  const second = runtime.dispose().then(() => resolved++);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolved, 0);
  hold.open();
  await Promise.all([first, second]);
  assert.deepEqual(log, ['released']);
  assert.equal(await runtime.enable('a'), false);
});

test('cordis-runtime late acquire after stop is refused and released', async () => {
  const log: string[] = [];
  let late: (() => void) | undefined;
  const runtime = new CordisPluginRuntime<Services>([
    plugin('a', [], (scope) => {
      late = () => scope.acquire(resource(log, 'late'));
    }),
  ], silent);
  await runtime.start();
  await runtime.dispose();
  assert.throws(() => late!(), /after it stopped/);
  assert.deepEqual(log, ['release late']);
});
