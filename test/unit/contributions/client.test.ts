import assert from "node:assert/strict";
import test from "node:test";
import { ProcessorClient } from "../../../src/plugins/codeBlocks/processor-client";
import { protocol } from "../../../src/plugins/codeBlocks/protocol";
import { CancelToken } from "../../../src/shared/rpc/lifecycle";
import { rpcPair } from "../../support/rpc-pair";

test("processor cache includes source identity and resets across owner restart", async () => {
  const pair = rpcPair();
  const client = new ProcessorClient(pair.client);
  let calls = 0;
  pair.host.handle(protocol, "render", (request) => {
    calls++;
    return { markdown: request.source };
  });
  client.configure({ epoch: 1, revision: 2, languages: ["diagram"] });
  const request = {
    language: "diagram",
    source: "body",
    uri: "file:///one.md",
    sourceLine: 0,
  };
  await client.render(request, new CancelToken());
  await client.render(request, new CancelToken());
  assert.equal(calls, 1);
  await client.render({ ...request, uri: "file:///two.md" }, new CancelToken());
  assert.equal(calls, 2);
  client.configure({ epoch: 1, revision: 1, languages: [] });
  assert.equal(client.accepts("diagram"), true);
  client.configure({ epoch: 2, revision: 0, languages: ["diagram"] });
  await client.render(request, new CancelToken());
  assert.equal(calls, 3);
  await pair.dispose();
});

test("reconfiguration cancels outstanding processor RPCs", async () => {
  const pair = rpcPair();
  const client = new ProcessorClient(pair.client);
  let started = () => {};
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  pair.host.handle(protocol, "render", async (_request, token) => {
    started();
    return new Promise<{ markdown: string }>((resolve) =>
      token.onCancel(() => resolve({ markdown: "late" })),
    );
  });
  client.configure({ epoch: 1, revision: 1, languages: ["diagram"] });
  const result = client.render(
    { language: "diagram", source: "", uri: "file:///one.md", sourceLine: 0 },
    new CancelToken(),
  );
  const rejected = assert.rejects(result, { code: "Cancelled" });
  await ready;
  client.configure({ epoch: 1, revision: 2, languages: [] });
  await rejected;
  await pair.dispose();
});
