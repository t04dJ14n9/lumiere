import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineManifest } from '../../src/extension/runtime/manifest';
import { activationOrder, PluginRuntime, type PluginDefinition } from '../../src/extension/runtime/plugin-runtime';

interface Services {
  a: { name: string };
  b: { name: string };
}

const silent = { info: () => undefined, error: () => undefined };

/** A resource that records when it is released. */
function resource(log: string[], name: string) {
  return { dispose: () => void log.push(`release ${name}`) };
}

function plugin(id: string, requires: string[], activate: PluginDefinition<Services>['activate'], optional?: string[]): PluginDefinition<Services> {
  return { manifest: defineManifest({ id, title: id, capabilities: [], requires, ...(optional ? { optional } : {}) }), activate };
}

test('plugins activate after what they require, whatever the catalog order', () => {
  const noop = (): void => undefined;
  const order = activationOrder([
    plugin('c', ['b'], noop),
    plugin('b', ['a'], noop),
    plugin('d', [], noop, ['c']),
    plugin('a', [], noop),
  ]).map(definition => definition.manifest.id);
  assert.deepEqual(order, ['a', 'b', 'c', 'd']);
});

test('a dependency cycle or an unknown requirement is an error', () => {
  const noop = (): void => undefined;
  assert.throws(() => activationOrder([plugin('a', ['b'], noop), plugin('b', ['a'], noop)]), /cycle: a -> b -> a/);
  assert.throws(() => activationOrder([plugin('a', ['missing'], noop)]), /requires missing/);
});

test('a plugin that throws is rolled back: its resources released in reverse, its services never published', async () => {
  const log: string[] = [];
  const errors: string[] = [];
  const runtime = new PluginRuntime<Services>([
    plugin('a', [], scope => {
      scope.acquire(resource(log, 'command'));
      scope.acquire(resource(log, 'worker'));
      scope.provide('a', { name: 'a' });
      throw new Error('socket refused');
    }),
    plugin('b', ['a'], () => void log.push('b started')),
  ], { info: () => undefined, error: message => void errors.push(message) });
  await runtime.start();
  assert.deepEqual(log, ['release worker', 'release command']);
  assert.equal(runtime.state('a'), 'failed');
  assert.equal(runtime.state('b'), 'blocked');
  assert.deepEqual(runtime.resources(), {});
  assert.match(errors[0]!, /a failed to start and was rolled back: socket refused/);
});

test('a service is visible to other plugins only after its provider commits', async () => {
  let seenDuringActivation: unknown = 'unset';
  const runtime = new PluginRuntime<Services>([
    plugin('a', [], async scope => {
      scope.provide('a', { name: 'a' });
      seenDuringActivation = scope.find('a');
      await Promise.resolve();
    }),
    plugin('b', ['a'], scope => {
      assert.equal(scope.get('a').name, 'a');
    }),
  ], silent);
  await runtime.start();
  assert.equal(seenDuringActivation, undefined);
  assert.equal(runtime.state('b'), 'active');
});

test('teardown mirrors activation: dependants first, and each plugin last acquired first', async () => {
  const log: string[] = [];
  const runtime = new PluginRuntime<Services>([
    plugin('a', [], scope => {
      scope.acquire(resource(log, 'a1'));
      scope.acquire(resource(log, 'a2'));
      scope.provide('a', { name: 'a' });
    }),
    plugin('b', ['a'], scope => {
      scope.acquire(resource(log, 'b1'));
      // While b releases, the service it depends on is still there.
      scope.acquire({ dispose: () => void log.push(`b sees ${scope.get('a').name}`) });
    }),
  ], silent);
  await runtime.start();
  await runtime.dispose();
  assert.deepEqual(log, ['b sees a', 'release b1', 'release a2', 'release a1']);
});

test('disabling a plugin first stops what depends on it, and enabling restarts it', async () => {
  const log: string[] = [];
  const runtime = new PluginRuntime<Services>([
    plugin('a', [], scope => {
      scope.acquire(resource(log, 'a'));
      scope.provide('a', { name: 'a' });
    }),
    plugin('b', [], scope => void scope.acquire(resource(log, 'b'))),
    plugin('c', [], scope => void scope.acquire(resource(log, 'c')), ['a']),
  ], silent);
  await runtime.start();
  await runtime.disable('a');
  assert.deepEqual(log, ['release c', 'release a']);
  assert.deepEqual(Object.keys(runtime.resources()), ['b']);
  assert.equal(await runtime.enable('a'), true);
  assert.deepEqual(runtime.resources(), { b: ['resource'], a: ['resource'] });
});

test('a resource acquired after its plugin stopped is released at once', async () => {
  const log: string[] = [];
  let late: (() => void) | undefined;
  const runtime = new PluginRuntime<Services>([
    plugin('a', [], scope => {
      late = () => scope.acquire(resource(log, 'late'));
    }),
  ], silent);
  await runtime.start();
  await runtime.dispose();
  assert.throws(() => late!(), /after it stopped/);
  assert.deepEqual(log, ['release late']);
});

test('a plugin still starting when the runtime is disposed is rolled back', async () => {
  const log: string[] = [];
  let finish: () => void = () => undefined;
  const runtime = new PluginRuntime<Services>([
    plugin('a', [], async scope => {
      scope.acquire(resource(log, 'a'));
      await new Promise<void>(resolve => { finish = resolve; });
    }),
  ], silent);
  const starting = runtime.start();
  await runtime.dispose();
  finish();
  await starting;
  assert.deepEqual(log, ['release a']);
  assert.equal(runtime.state('a'), 'failed');
});
