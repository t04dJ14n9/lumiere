import assert from 'node:assert/strict';
import test from 'node:test';
import { browserRenderEnvironment, warmWasm } from '../../src/webview/browser-render-environment';

test('the WASM is fetched once, however early it is warmed, and a failure is retried', async () => {
  const real = globalThis.fetch;
  let calls = 0;
  let fail = true;
  globalThis.fetch = (async () => {
    calls++;
    return fail ? new Response('', { status: 503 }) : new Response('wasm');
  }) as typeof fetch;
  try {
    await assert.rejects(warmWasm('x://a.wasm'), /503/);
    fail = false;
    const first = await warmWasm('x://a.wasm');
    const second = await browserRenderEnvironment.fetchWasm('x://a.wasm');
    assert.equal(await first.text(), 'wasm');
    assert.equal(second, first);
    assert.equal(calls, 2, 'one failed attempt, one successful fetch');
  } finally {
    globalThis.fetch = real;
  }
});
