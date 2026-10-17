import { CancelToken } from "../../../src/shared/rpc/lifecycle";
import assert from "node:assert/strict";
import test from "node:test";
import { createRoot } from "@workshop/core";
import { RevealRouter } from "../../../src/host/reveal-router";
import { linksHost } from "../../../src/plugins/links/host";
import { protocol } from "../../../src/plugins/links/protocol";
import type { VaultIndex } from "../../../src/plugins/vault/api";
import type { Workshop, PanelShell } from "../../../src/shared/runtime";
import { rpcPair } from "../../support/rpc-pair";

test("a slow earlier link resolution cannot open over a newer request", async () => {
  const root = createRoot();
  const pair = rpcPair();
  const router = new RevealRouter();
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const openings: string[] = [];
  root.provide("rpc", pair.host);
  root.provide("resources", {
    async load() {
      throw new Error("unused");
    },
  });
  root.provide("vault", {
    root: "memory:/vault",
    onDidResolve: () => () => {},
    unresolvedLinks: () => new Map(),
    classifyLink: () => undefined,
    resolveLink: () => undefined,
  } as unknown as VaultIndex);
  root.provide("workshop", {
    config: () => ({ preset: "obsidian", mode: "livePreview" }),
    navigation: {
      scheme: "vscode",
      external: async () => true,
      confirm: async () => true,
      begin: () => router.begin(),
      registerReveal: (panel) => router.register(panel),
      async resolve({ path }) {
        if (path === "A.md") {
          entered();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return `memory:/vault/${path}`;
      },
      async open(_root, uri) {
        openings.push(uri);
      },
    },
  } as Partial<Workshop> as Workshop);
  root.plugin(linksHost, {
    panel: {
      id: "pane",
      document: { uri: "memory:/vault/Source.md" },
      active: () => true,
    } as PanelShell,
  });
  await root.settled();
  const first = pair.client.call(protocol, "open", {
    href: "A.md",
    wiki: false,
    side: false,
  });
  await waiting;
  assert.equal(
    await pair.client.call(protocol, "open", {
      href: "B.md",
      wiki: false,
      side: false,
    }),
    true,
  );
  release();
  assert.equal(await first, false);
  assert.deepEqual(openings, ["memory:/vault/B.md"]);
  const token = new CancelToken();
  const cancelled = pair.client.call(
    protocol,
    "open",
    { href: "A.md", wiki: false, side: false },
    { token },
  );
  const rejected = assert.rejects(cancelled, { code: "Cancelled" });
  await new Promise<void>((resolve) => setImmediate(resolve));
  token.cancel();
  release();
  await rejected;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(openings, ["memory:/vault/B.md"]);
  await root.dispose();
  await pair.dispose();
});
