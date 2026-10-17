import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRuntimeImpl, RUNTIME_IMPL_ENV } from '../../src/extension/runtime/runtime-impl';

test('resolveRuntimeImpl defaults to native', () => {
  const previous = process.env[RUNTIME_IMPL_ENV];
  delete process.env[RUNTIME_IMPL_ENV];
  try {
    assert.equal(resolveRuntimeImpl(() => undefined), 'native');
    assert.equal(resolveRuntimeImpl(() => 'cordis'), 'cordis');
    assert.equal(resolveRuntimeImpl(() => 'native'), 'native');
    assert.equal(resolveRuntimeImpl(() => 'other'), 'native');
  } finally {
    if (previous === undefined) delete process.env[RUNTIME_IMPL_ENV];
    else process.env[RUNTIME_IMPL_ENV] = previous;
  }
});

test('resolveRuntimeImpl env overrides setting', () => {
  const previous = process.env[RUNTIME_IMPL_ENV];
  try {
    process.env[RUNTIME_IMPL_ENV] = 'cordis';
    assert.equal(resolveRuntimeImpl(() => 'native'), 'cordis');
    process.env[RUNTIME_IMPL_ENV] = 'NATIVE';
    assert.equal(resolveRuntimeImpl(() => 'cordis'), 'native');
  } finally {
    if (previous === undefined) delete process.env[RUNTIME_IMPL_ENV];
    else process.env[RUNTIME_IMPL_ENV] = previous;
  }
});
