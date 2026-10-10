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

/** A promise the test settles by hand, for ordering without sleeps. */
function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>(resolve => { open = resolve; });
  return { opened, open };
}

test('dispose while a plugin is still starting releases what it acquired before dispose resolves', async () => {
  const log: string[] = [];
  const hold = gate();
  const acquired = gate();
  let lateAcquire: unknown;
  const runtime = new PluginRuntime<Services>([
    plugin('a', [], async scope => {
      scope.acquire(resource(log, 'a'));
      acquired.open();
      await hold.opened;
      try {
        scope.acquire(resource(log, 'late'));
      } catch (error) {
        lateAcquire = error;
      }
    }),
  ], silent);
  const starting = runtime.start();
  await acquired.opened;
  await runtime.dispose();
  // Released before dispose resolved, with activate still suspended.
  assert.deepEqual(log, ['release a']);
  assert.equal(runtime.state('a'), 'inactive');
  assert.deepEqual(runtime.resources(), {});
  hold.open();
  await starting;
  assert.match(String(lateAcquire), /after it stopped/);
  assert.deepEqual(log, ['release a', 'release late']);
  assert.equal(runtime.state('a'), 'inactive');
});

test('a plugin disabled while it starts never commits, and its services are never published', async () => {
  const log: string[] = [];
  const hold = gate();
  const acquired = gate();
  const runtime = new PluginRuntime<Services>([
    plugin('slow', [], async scope => {
      scope.acquire(resource(log, 'slow'));
      scope.provide('a', { name: 'slow' });
      acquired.open();
      await hold.opened;
    }),
    plugin('user', [], scope => void log.push(`user sees ${String(scope.find('a')?.name)}`), ['slow']),
  ], silent);
  const enabling = runtime.enable('slow');
  await acquired.opened;
  assert.equal(runtime.state('slow'), 'starting');
  await runtime.disable('slow');
  assert.deepEqual(log, ['release slow']);
  hold.open();
  assert.equal(await enabling, false);
  assert.equal(runtime.state('slow'), 'inactive');
  assert.deepEqual(runtime.resources(), {});
  await runtime.enable('user');
  assert.deepEqual(log, ['release slow', 'user sees undefined']);
});

test('concurrent enables of one plugin join a single activation', async () => {
  let activations = 0;
  const hold = gate();
  const runtime = new PluginRuntime<Services>([
    plugin('a', [], async scope => {
      activations++;
      scope.provide('a', { name: 'a' });
      await hold.opened;
    }),
  ], silent);
  const first = runtime.enable('a');
  const second = runtime.enable('a');
  hold.open();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(activations, 1);
  assert.equal(runtime.state('a'), 'active');
});

test('a consumer whose provider stops while it starts is cancelled, and does not commit against the new provider', async () => {
  const log: string[] = [];
  const hold = gate();
  const acquired = gate();
  const runtime = new PluginRuntime<Services>([
    plugin('a', [], scope => {
      scope.acquire(resource(log, 'a'));
      scope.provide('a', { name: 'a' });
    }),
    plugin('b', ['a'], async scope => {
      scope.acquire(resource(log, 'b'));
      acquired.open();
      await hold.opened;
    }),
  ], silent);
  await runtime.enable('a');
  const enablingB = runtime.enable('b');
  await acquired.opened;
  await runtime.disable('a');
  // The consumer was cancelled and released first, then the provider.
  assert.deepEqual(log, ['release b', 'release a']);
  assert.equal(await runtime.enable('a'), true);
  hold.open();
  assert.equal(await enablingB, false);
  assert.equal(runtime.state('b'), 'inactive');
  assert.deepEqual(Object.keys(runtime.resources()), ['a']);
});

test('teardown waits for a dependant that is already stopping before releasing its provider', async () => {
  const log: string[] = [];
  const hold = gate();
  const runtime = new PluginRuntime<Services>([
    plugin('a', [], scope => {
      scope.acquire(resource(log, 'a'));
      scope.provide('a', { name: 'a' });
    }),
    plugin('b', ['a'], scope => {
      scope.acquire({
        dispose: async () => {
          log.push('b stopping');
          await hold.opened;
          log.push('b stopped');
        },
      });
    }),
  ], silent);
  await runtime.start();
  const stoppingB = runtime.disable('b');
  const stoppingA = runtime.disable('a');
  const disposing = runtime.dispose();
  await Promise.resolve();
  assert.deepEqual(log, ['b stopping']);
  hold.open();
  await Promise.all([stoppingB, stoppingA, disposing]);
  assert.deepEqual(log, ['b stopping', 'b stopped', 'release a']);
});

test('two concurrent dispose calls both resolve only after cleanup has finished', async () => {
  const log: string[] = [];
  const hold = gate();
  const runtime = new PluginRuntime<Services>([
    plugin('a', [], scope => {
      scope.acquire({ dispose: async () => { await hold.opened; log.push('released'); } });
    }),
  ], silent);
  await runtime.start();
  let resolved = 0;
  const first = runtime.dispose().then(() => resolved++);
  const second = runtime.dispose().then(() => resolved++);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(resolved, 0);
  hold.open();
  await Promise.all([first, second]);
  assert.deepEqual(log, ['released']);
});

for (const stop of ['dispose', 'disable'] as const) {
  for (const outcome of ['finishes', 'fails'] as const) {
    test(`${stop} during a failed activation's rollback waits for the rollback's release (the inverse ${outcome})`, async () => {
      const rollbackStarted = gate();
      const finish = gate();
      const errors: string[] = [];
      let released = false;
      const runtime = new PluginRuntime<Services>([
        plugin('a', [], scope => {
          scope.acquire({
            dispose: async () => {
              rollbackStarted.open();
              await finish.opened;
              released = true;
              if (outcome === 'fails') throw new Error('close failed');
            },
          });
          throw new Error('socket refused');
        }),
      ], { info: () => undefined, error: message => void errors.push(message) });
      const starting = runtime.start();
      await rollbackStarted.opened;
      let stopped = false;
      const stopping = (stop === 'dispose' ? runtime.dispose() : runtime.disable('a')).then(() => (stopped = true));
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(stopped, false, `${stop} resolved while the rollback was still releasing`);
      finish.open();
      await Promise.all([starting, stopping]);
      assert.equal(released, true);
      assert.deepEqual(runtime.resources(), {});
      // The cleanup error is reported once, not once per caller.
      assert.equal(errors.filter(error => /close failed/.test(error)).length, outcome === 'fails' ? 1 : 0);
    });
  }
}
