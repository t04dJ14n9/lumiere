import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import type { Resources } from "../../../src/plugins/resources/api";
import { protocol } from "../../../src/plugins/resources/protocol";
import { resourcesWebview } from "../../../src/plugins/resources/webview";
import {
  forgetEmbedResources,
  getCachedEmbedResource,
  setCachedEmbedResource,
} from "../../../src/plugins/embeds/resource-cache";
import { rpcPair } from "../../support/rpc-pair";

test("a rewritten file resolves again, with its new version, after resources/changed", async () => {
  const pair = rpcPair();
  let version = 1;
  pair.host.handle(protocol, "load", ({ target }) => ({
    kind: "image" as const,
    source: `file:///vault/${target}`,
    url: `https://file/${target}?v=${version}`,
  }));
  const root = createRoot();
  root.provide("rpc", pair.client);
  root.plugin(resourcesWebview);
  let resources: Resources | undefined;
  root.plugin({
    name: "reader",
    inject: { required: ["resources"] },
    apply(ctx) {
      resources = ctx.resources;
    },
  });
  await root.settled();
  const load = () =>
    resources!.load("Sketch.sketch.svg", "file:///vault/Note.md", "wikilink");

  assert.equal((await load()).url, "https://file/Sketch.sketch.svg?v=1");
  version = 2;
  assert.equal(
    (await load()).url,
    "https://file/Sketch.sketch.svg?v=1",
    "cached until told",
  );
  root.emit("resources/changed");
  assert.equal(
    resources!.peek?.("Sketch.sketch.svg", "file:///vault/Note.md", "wikilink"),
    undefined,
  );
  assert.equal((await load()).url, "https://file/Sketch.sketch.svg?v=2");
  await root.dispose();
  await pair.dispose();
});

test("embeds forget what they resolved with a resources service", () => {
  const resources: Resources = { load: () => Promise.reject(new Error()) };
  const other: Resources = { load: () => Promise.reject(new Error()) };
  const image = { kind: "image" as const, source: "s", url: "u?v=1" };
  setCachedEmbedResource(resources, "key", image);
  setCachedEmbedResource(other, "key", image);
  assert.equal(getCachedEmbedResource(resources, "key"), image);

  forgetEmbedResources(resources);
  assert.equal(getCachedEmbedResource(resources, "key"), undefined);
  assert.equal(getCachedEmbedResource(other, "key"), image);
});
