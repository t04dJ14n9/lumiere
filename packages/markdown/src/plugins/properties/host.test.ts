import { provideHostServices } from "../../shared/host";
import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import { Endpoint } from "../../shared/rpc/endpoint";
import type { PanelShell } from "../../shared/host";
import type { VaultIndex } from "../vault/api";
import { fakeHost } from "../../../test/support/vscode-fake";
import { propertiesHost } from "./host";
import { protocol } from "./protocol";
test("property RPC shares preferences, validates keys and disposes handlers on disable", async () => {
  let hostReceive = (_value: unknown) => {};
  let clientReceive = (_value: unknown) => {};
  const clock = { after: () => () => {} };
  const host = new Endpoint(
    {
      send: (value) => clientReceive(value),
      listen(fn) {
        hostReceive = fn;
        return () => {};
      },
    },
    clock,
  );
  const client = new Endpoint(
    {
      send: (value) => hostReceive(value),
      listen(fn) {
        clientReceive = fn;
        return () => {};
      },
    },
    clock,
  );
  const saved = new Map<string, unknown>();
  const root = createRoot();
  root.provide("rpc", host);
  root.provide("vault", {
    root: "file:///vault",
    files: () => [{ path: "One.md" }, { path: "Two.md" }],
    metadata: (path: string) => ({
      frontmatter: path === "One.md" ? { status: "done" } : { list: ["a"] },
    }),
  } as unknown as VaultIndex);
  provideHostServices(
    root,
    fakeHost({
      storage: {
        get<T>(key: string, fallback: T): T {
          return (saved.get(key) as T) ?? fallback;
        },
        async update(key, value) {
          saved.set(key, value);
        },
      },
    }),
  );
  const enable = () =>
    root.plugin(propertiesHost, {
      panel: { document: { uri: "file:///vault/One.md" } } as PanelShell,
    });
  let fiber = enable();
  await root.settled();
  let broadcasts = 0;
  const stop = client.on(protocol, "types", () => {
    broadcasts++;
  });
  assert.deepEqual(await client.call(protocol, "types", {}), {});
  assert.deepEqual(
    await client.call(protocol, "setType", { key: "Due", kind: "date" }),
    { due: "date" },
  );
  assert.equal(broadcasts, 1);
  assert.deepEqual(await client.call(protocol, "names", {}), [
    "aliases",
    "cssclasses",
    "due",
    "list",
    "status",
    "tags",
  ]);
  assert.equal(await client.call(protocol, "collapsed", {}), false);
  assert.equal(
    await client.call(protocol, "setCollapsed", { collapsed: true }),
    true,
  );
  for (const key of ["tags", "aliases", "cssclasses"]) {
    await assert.rejects(
      client.call(protocol, "setType", { key, kind: "text" }),
    );
    await assert.rejects(client.call(protocol, "setType", { key }));
  }
  await assert.rejects(
    client.call(protocol, "setType", { key: " ", kind: "text" }),
  );
  await assert.rejects(
    client.call(protocol, "setType", { key: "x", kind: "tags" }),
  );
  await fiber.dispose();
  await assert.rejects(client.call(protocol, "types", {}));
  await assert.rejects(client.call(protocol, "names", {}));
  await assert.rejects(client.call(protocol, "collapsed", {}));
  fiber = enable();
  await root.settled();
  assert.equal(fiber.state, "active");
  assert.deepEqual(await client.call(protocol, "types", {}), { due: "date" });
  assert.equal(await client.call(protocol, "collapsed", {}), true);
  await stop();
  await root.dispose();
  host.dispose();
  client.dispose();
});
