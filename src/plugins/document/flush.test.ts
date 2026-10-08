import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../kernel";
import { Endpoint } from "../../shared/rpc/endpoint";
import type { ViewDocument } from "./api";
import { documentWebview } from "./webview";

test("document flush rejects draft errors before transport and unregisters stopped participants", async () => {
  const root = Context.create();
  const rpc = new Endpoint(
    {
      send() {},
      listen() {
        return () => {};
      },
    },
    {
      after() {
        return () => {};
      },
    },
  );
  root.provide("rpc", rpc);
  root.plugin(documentWebview, { version: 0, clientID: "draft" });
  let document!: ViewDocument;
  root.plugin({
    name: "flush-test",
    inject: { required: ["document"] },
    apply(ctx) {
      document = ctx.document;
    },
  });
  await root.settled();
  let calls = 0;
  const stop = document.beforeFlush!(() => {
    calls++;
    throw new Error("Invalid property draft");
  });
  await assert.rejects(document.flush(), /Invalid property draft/);
  assert.equal(calls, 1);
  await stop();
  await assert.rejects(document.flush(), /Editor not mounted/);
  assert.equal(calls, 1);
  await root.dispose();
  rpc.dispose();
});
