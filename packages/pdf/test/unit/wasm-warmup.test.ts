import assert from "node:assert/strict";
import test from "node:test";
import {
  browserRenderEnvironment,
  warmWasm,
} from "../../src/webview/browser-render-environment";

test("the WASM is fetched once, however early it is warmed, and a failure is retried", async () => {
  const real = globalThis.fetch;
  let calls = 0;
  let fail = true;
  globalThis.fetch = (async () => {
    calls++;
    return fail ? new Response("", { status: 503 }) : new Response("wasm");
  }) as typeof fetch;
  try {
    await assert.rejects(warmWasm("x://a.wasm"), /503/);
    fail = false;
    const first = await warmWasm("x://a.wasm");
    const second = await browserRenderEnvironment.fetchWasm("x://a.wasm");
    assert.equal(await first.text(), "wasm");
    assert.equal(second, first);
    assert.equal(calls, 2, "one failed attempt, one successful fetch");
  } finally {
    globalThis.fetch = real;
  }
});

test("only the latest WASM URL is retained, so blobs do not accumulate", async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (url: string) => {
    calls++;
    return new Response(`wasm ${url}`);
  }) as unknown as typeof fetch;
  try {
    const a = await warmWasm("x://one.wasm");
    const b = await warmWasm("x://two.wasm");
    assert.notEqual(a, b);
    assert.equal(calls, 2);
    // The first URL's blob was dropped: asking again fetches again.
    const again = await warmWasm("x://one.wasm");
    assert.equal(calls, 3);
    assert.notEqual(again, a);
    assert.equal(
      await warmWasm("x://one.wasm"),
      again,
      "the latest is still shared",
    );
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = real;
  }
});
