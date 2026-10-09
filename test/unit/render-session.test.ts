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
  const reported: string[] = [];
  let wasmFails = false;
  const env: RenderSessionEnvironment<FakeEngine> = {
    createEngine: (mode, wasmUrl) => new Promise((resolve, reject) => {
      pending.push({ mode, resolve, reject, engine: { mode, wasmUrl, destroyed: false } });
    }),
    destroyEngine: async engine => { engine.destroyed = true; },
    reportError: (message, error) => { reported.push(`${message}: ${String(error)}`); },
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
  return { env, urls, reported, finish, settle, failWasm: () => { wasmFails = true; } };
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
  await session.dispose();
});

test('dispose stops every engine, revokes the blob URL and lets go of the bytes', async () => {
  const { env, urls, finish } = environment();
  const session = new PdfRenderSession(bytes(), 'wasm', env);
  void session.engine('worker');
  const engine = await finish();
  await session.dispose();
  assert.equal(engine.destroyed, true);
  assert.deepEqual(urls.revoked, urls.created);
  assert.throws(() => session.buffer, RenderSessionDisposedError);
  await assert.rejects(session.engine('worker'), RenderSessionDisposedError);
  await session.dispose();
});

test('an engine that finishes starting after dispose is destroyed, never handed out', async () => {
  const { env, finish, settle } = environment();
  const session = new PdfRenderSession(bytes(), 'wasm', env);
  const asked = session.engine('main-thread');
  await settle();
  await session.dispose();
  const late = await finish();
  assert.equal(late.destroyed, true);
  await assert.rejects(asked, RenderSessionDisposedError);
});

test('giving up on the worker stops its engine, even one still starting', async () => {
  const { env, finish, settle } = environment();
  const session = new PdfRenderSession(bytes(), 'wasm', env);
  const worker = session.engine('worker');
  await settle();
  void session.release('worker');
  const main = session.engine('main-thread');
  const late = await finish();
  assert.equal(late.mode, 'worker');
  assert.equal(late.destroyed, true);
  await assert.rejects(worker, RenderSessionDisposedError);
  const used = await finish();
  assert.equal(await main, used);
  assert.equal(used.destroyed, false);
  await session.dispose();
  assert.equal(used.destroyed, true);
});

test('a WASM fetch failure rejects the worker engine without creating anything', async () => {
  const { env, urls, failWasm, settle } = environment();
  failWasm();
  const session = new PdfRenderSession(bytes(), 'wasm', env);
  await assert.rejects(session.engine('worker'), /offline/);
  await settle();
  assert.deepEqual(urls.created, []);
  await session.dispose();
});

test('an engine released before it began starting is never created', async () => {
  const { env, finish } = environment();
  const session = new PdfRenderSession(bytes(), 'wasm', env);
  const worker = session.engine('worker');
  void session.release('worker');
  await assert.rejects(worker, RenderSessionDisposedError);
  await assert.rejects(finish(), /no engine is starting/);
  await session.dispose();
});

/** A promise settled by hand. */
function gate() {
  let open: () => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const opened = new Promise<void>((resolve, reject) => { open = resolve; fail = reject; });
  return { opened, open, fail };
}

test('the main-thread engine starts only after the worker engine has finished stopping', async () => {
  const { env, finish, settle } = environment();
  const stopped = gate();
  const order: string[] = [];
  env.destroyEngine = async engine => {
    order.push(`stopping ${engine.mode}`);
    await stopped.opened;
    engine.destroyed = true;
    order.push(`stopped ${engine.mode}`);
  };
  const create = env.createEngine;
  env.createEngine = (mode, url) => {
    order.push(`create ${mode}`);
    return create(mode, url);
  };
  const session = new PdfRenderSession(bytes(), 'wasm', env);
  const worker = session.engine('worker');
  const started = await finish();
  assert.equal(await worker, started);
  const released = session.release('worker');
  const main = session.engine('main-thread');
  await settle();
  assert.deepEqual(order, ['create worker', 'stopping worker']);
  stopped.open();
  await released;
  const used = await finish();
  assert.equal(await main, used);
  assert.deepEqual(order, ['create worker', 'stopping worker', 'stopped worker', 'create main-thread']);
});

test('dispose resolves only when the engines have stopped', async () => {
  const { env, finish } = environment();
  const stopped = gate();
  env.destroyEngine = async engine => { await stopped.opened; engine.destroyed = true; };
  const session = new PdfRenderSession(bytes(), 'wasm', env);
  void session.engine('main-thread');
  const engine = await finish();
  let disposed = false;
  const disposing = session.dispose().then(() => { disposed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(disposed, false);
  stopped.open();
  await disposing;
  assert.equal(engine.destroyed, true);
});

test('a failing engine stop does not skip the URL and buffer cleanup, and is reported', async () => {
  const { env, urls, reported, finish } = environment();
  env.destroyEngine = () => { throw new Error('worker wedged'); };
  const session = new PdfRenderSession(bytes(), 'wasm', env);
  void session.engine('worker');
  await finish();
  await session.dispose();
  assert.deepEqual(urls.revoked, urls.created);
  assert.equal(urls.created.length, 1);
  assert.throws(() => session.buffer, RenderSessionDisposedError);
  assert.deepEqual(reported, ['Could not stop the PDF engine: Error: worker wedged']);
});
