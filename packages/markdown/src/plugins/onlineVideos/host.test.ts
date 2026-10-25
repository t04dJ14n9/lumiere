import { provideHostServices } from "../../shared/host";
import { fakeHost } from "../../../test/support/vscode-fake";
import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import { Endpoint } from "../../shared/rpc/endpoint";
import type { PanelShell } from "../../shared/host";
import { onlineVideosHost } from "./host";
import { protocol } from "./protocol";

function pair() {
  let toHost: (value: unknown) => void = () => {};
  let toClient: (value: unknown) => void = () => {};
  const clock = { after: () => () => {} };
  const host = new Endpoint(
    {
      send: (value) => toClient(value),
      listen(fn) {
        toHost = fn;
        return () => {};
      },
    },
    clock,
  );
  const client = new Endpoint(
    {
      send: (value) => toHost(value),
      listen(fn) {
        toClient = fn;
        return () => {};
      },
    },
    clock,
  );
  return { host, client };
}

test("the host looks up details only in a trusted workspace", async (t) => {
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    requests.push(url);
    return new Response(JSON.stringify({ title: "Rick", author_name: "RA" }), {
      headers: { "content-type": "application/json" },
    });
  });
  let trusted = false;
  const { host, client } = pair();
  const root = createRoot();
  root.provide("rpc", host);
  provideHostServices(
    root,
    fakeHost({ workspace: { isTrusted: () => trusted } }),
  );
  root.plugin(onlineVideosHost, { panel: {} as PanelShell });
  await root.settled();
  const ask = () =>
    client.call(protocol, "details", {
      provider: "youtube",
      id: "dQw4w9WgXcQ",
      kind: "video",
    });
  await assert.rejects(ask(), /trusted workspace/);
  assert.deepEqual(requests, []);
  trusted = true;
  assert.deepEqual(await ask(), { title: "Rick", author: "RA" });
  assert.equal(requests.length, 1);
  assert.match(requests[0]!, /^https:\/\/www\.youtube\.com\/oembed\?/);
  await root.dispose();
});
