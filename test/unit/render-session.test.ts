import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PdfRenderSession,
  RenderSessionDisposedError,
  type EngineMode,
  type RenderSessionEnvironment,
} from '../../src/webview/render-session';

interface FakeEngine { mode: EngineMode; wasmUrl: string; destroyed: boolean }

/** An environment whose engines start only when the test says so. */
function environment() {
  const pending: { mode: EngineMode; resolve: (engine: FakeEngine) => void; reject: (error: Error) => void; engine: FakeEngine }[] = [];
  const urls = { created: [] as string[], revoked: [] as string[] };
  let wasmFails = false;
  const env: RenderSessionEnvironment<FakeEngine> = {
    createEngine: (mode, wasmUrl) => new Promise((resolve, reject) => {
      pending.push({ mode, resolve, reject, engine: { mode, wasmUrl, destroyed: false } });
    }),
    destroyEngine: engine => { engine.destroyed = true; },
    fetchWasm: async () => {
      if (wasmFails) throw new Error('offline');
      return new Blob(['wasm']);
    },
    createObjectUrl: () => {
      const url = `blob:${urls.created.length}`;
      urls.created.push(url);
      return url;
    },
    revokeObjectUrl: url => { urls.revoked.push(url); },
  };
  const settle = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  /** Finish starting the oldest engine still starting. */
  const finish = async (): Promise<FakeEngine> => {
    await settle();
    const next = pending.shift();
    if (!next) throw new Error('no engine is starting');
    next.resolve(next.engine);
    await settle();
    return next.engine;
  };
  return { env, urls, finish, settle, failWasm: () => { wasmFails = true; } };
}

const bytes = (): ArrayBuffer => new Uint8Array([37, 80, 68, 70]).buffer;

test('the worker engine loads its WASM from a blob URL, the main-thread engine from the resource URL', async () => {
  const { env, finish } = environment();
  const session = new PdfRenderSession(bytes(), 'vscode-resource:/pdfium.wasm', env);
  const worker = session.engine('worker');
  const started = await finish();
  assert.equal(await worker, started);
  assert.equal(started.wasmUrl, 'blob:0');
  const main = session.engine('main-thread');
  assert.equal((await finish()).wasmUrl, 'vscode-resource:/pdfium.wasm');
  await main;
  // One engine per mode: asking again returns the same one.
  assert.equal(await session.engine('worker'), started);
  session.dispose();
});

test('dispose stops every engine, revokes the blob URL and lets go of the bytes', async () => {
  const { env, urls, finish } = environment();
  const session = new PdfRenderSession(bytes(), 'wasm', env);
  void session.engine('worker');
  const engine = await finish();
  session.dispose();
  assert.equal(engine.destroyed, true);
  assert.deepEqual(urls.revoked, urls.created);
  assert.throws(() => session.buffer, RenderSessionDisposedError);
  await assert.rejects(session.engine('worker'), RenderSessionDisposedError);
  session.dispose();
});

test('an engine that finishes starting after dispose is destroyed, never handed out', async () => {
  const { env, finish } = environment();
  const session = new PdfRenderSession(bytes(), 'wasm', env);
  const asked = session.engine('main-thread');
  session.dispose();
  const late = await finish();
  assert.equal(late.destroyed, true);
  await assert.rejects(asked, RenderSessionDisposedError);
});

test('giving up on the worker stops its engine, even one still starting', async () => {
  const { env, finish, settle } = environment();
  const session = new PdfRenderSession(bytes(), 'wasm', env);
  const worker = session.engine('worker');
  await settle();
  session.release('worker');
  const main = session.engine('main-thread');
  const late = await finish();
  assert.equal(late.mode, 'worker');
  assert.equal(late.destroyed, true);
  await assert.rejects(worker, RenderSessionDisposedError);
  const used = await finish();
  assert.equal(await main, used);
  assert.equal(used.destroyed, false);
  session.dispose();
  assert.equal(used.destroyed, true);
});

test('a WASM fetch failure rejects the worker engine without creating anything', async () => {
  const { env, urls, failWasm, settle } = environment();
  failWasm();
  const session = new PdfRenderSession(bytes(), 'wasm', env);
  await assert.rejects(session.engine('worker'), /offline/);
  await settle();
  assert.deepEqual(urls.created, []);
  session.dispose();
});

test('an engine released before it began starting is never created', async () => {
  const { env, finish } = environment();
  const session = new PdfRenderSession(bytes(), 'wasm', env);
  const worker = session.engine('worker');
  session.release('worker');
  await assert.rejects(worker, RenderSessionDisposedError);
  await assert.rejects(finish(), /no engine is starting/);
  session.dispose();
});
