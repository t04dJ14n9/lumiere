import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import { markersHost } from "../../../src/plugins/markers/host";
import { protocol } from "../../../src/plugins/markers/protocol";
import type { Markers } from "../../../src/plugins/markers/api";
import { fixture } from "../copy-for-agent/fixture";
test("markers isolate owners, validate atomically and revoke disposed providers and actions", async () => {
  const f = fixture();
  const root = Context.create();
  root.provide("editors", f.editors);
  const host = root.plugin(markersHost);
  await root.settled();
  let first!: Markers;
  let second!: Markers;
  let actions = 0;
  const one = root.plugin({
    name: "one",
    inject: { required: ["markers"] },
    apply(ctx) {
      first = ctx.markers;
      first.registerAction("open", () => {
        actions++;
      });
    },
  });
  root.plugin({
    name: "two",
    inject: { required: ["markers"] },
    apply(ctx) {
      second = ctx.markers;
    },
  });
  await root.settled();
  const marker = {
    id: "m",
    from: 0,
    to: 3,
    documentVersion: 1,
    label: "Question",
    actionId: "open",
  };
  first.set("panel", [marker]);
  second.set("panel", [{ ...marker, label: "Other" }]);
  let snapshot = await f.pair.client.call(protocol, "current", {});
  assert.deepEqual(Object.keys(snapshot.owners), ["one", "two"]);
  assert.throws(() => first.set("panel", [marker, marker]), {
    code: "DuplicateContribution",
  });
  assert.throws(() =>
    first.set("panel", [{ ...marker, label: "x".repeat(121) }]),
  );
  assert.throws(() => first.set("panel", Array(1001).fill(marker)));
  assert.equal(
    await f.pair.client.call(protocol, "activate", {
      owner: "two",
      markerId: "m",
    }),
    false,
  );
  assert.equal(
    await f.pair.client.call(protocol, "activate", {
      owner: "one",
      markerId: "m",
    }),
    true,
  );
  assert.equal(actions, 1);
  await one.dispose();
  snapshot = await f.pair.client.call(protocol, "current", {});
  assert.deepEqual(Object.keys(snapshot.owners), ["two"]);
  assert.throws(() => first.set("panel", [marker]), { code: "PluginDisabled" });
  await host.dispose();
  await assert.rejects(f.pair.client.call(protocol, "current", {}), {
    code: "PluginDisabled",
  });
  await root.dispose();
  await f.pair.dispose();
});

test("marker sets remain independent in two panels of the same document", async () => {
  const { MarkerStore } = await import("../../../src/plugins/markers/store");
  const f = fixture();
  const sibling = { ...f.panel, id: "second" };
  const store = new MarkerStore(
    () => [f.panel, sibling],
    () => {},
  );
  const markers = store.service("owner");
  markers.set("panel", [
    { id: "one", from: 0, to: 3, documentVersion: 1, label: "One" },
  ]);
  markers.set("second", [
    { id: "two", from: 5, to: 8, documentVersion: 1, label: "Two" },
  ]);
  assert.equal(store.snapshot("panel").owners.owner![0]!.id, "one");
  assert.equal(store.snapshot("second").owners.owner![0]!.from, 4);
  f.state.text = "new\r\n" + f.state.text;
  f.state.version++;
  f.panel.session.changed();
  store.changed(f.panel.document, [{ from: 0, to: 0, insert: "new\r\n" }]);
  assert.equal(store.snapshot("panel").owners.owner![0]!.from, 4);
  assert.equal(store.snapshot("second").owners.owner![0]!.from, 8);
  markers.clear("panel");
  assert.deepEqual(store.snapshot("panel").owners, {});
  assert.equal(store.snapshot("second").owners.owner!.length, 1);
  store.dispose();
  await f.pair.dispose();
});
