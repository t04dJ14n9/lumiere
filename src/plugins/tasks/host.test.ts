import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../kernel";
import { Endpoint } from "../../shared/rpc/endpoint";
import type { HostDocument, PanelShell, Workshop } from "../../shared/runtime";
import { tasksHost } from "./host";
import { protocol } from "./protocol";
test("task RPC authorizes known notes, rejects stale lines and stops with its fiber", async () => {
  let a: (value: unknown) => void = () => {};
  let b: (value: unknown) => void = () => {};
  const clock = {
    after() {
      return () => {};
    },
  };
  const host = new Endpoint(
    {
      send: (value) => b(value),
      listen(fn) {
        a = fn;
        return () => {};
      },
    },
    clock,
  );
  const client = new Endpoint(
    {
      send: (value) => a(value),
      listen(fn) {
        b = fn;
        return () => {};
      },
    },
    clock,
  );
  const root = Context.create();
  const document = {
    uri: "file:///vault/Note.md",
    getText: () => "- [ ] task\r\nnext",
  } as HostDocument;
  const authorized: string[] = [];
  let edits = 0;
  root.provide("rpc", host);
  root.provide("resources", {
    async load() {
      throw new Error("unused");
    },
    async authorize(source) {
      if (source !== document.uri) {
        throw new Error("Unknown note source");
      }
      authorized.push(source);
    },
  });
  root.provide("workshop", {
    async apply(doc, changes) {
      assert.equal(doc, document);
      assert.deepEqual(changes, [{ from: 3, to: 4, insert: "x" }]);
      edits++;
      return true;
    },
  } as Workshop);
  const enable = () =>
    root.plugin(tasksHost, { panel: { document } as PanelShell });
  let fiber = enable();
  await root.settled();
  const request = { line: 0, expected: "- [ ] task", checked: true };
  assert.equal(await client.call(protocol, "toggle", request), true);
  assert.equal(edits, 1);
  assert.equal(authorized.length, 1);
  assert.equal(
    await client.call(protocol, "toggle", { ...request, expected: "stale" }),
    false,
  );
  await assert.rejects(
    client.call(protocol, "toggle", {
      ...request,
      source: "file:///outside.md",
    }),
  );
  assert.equal(edits, 1);
  await fiber.dispose();
  await assert.rejects(client.call(protocol, "toggle", request));
  fiber = enable();
  await root.settled();
  assert.equal(fiber.state, "active");
  assert.equal(await client.call(protocol, "toggle", request), true);
  assert.equal(edits, 2);
  await root.dispose();
  host.dispose();
  client.dispose();
});
