import { provideHostServices } from "../../shared/host";
import { fakeHost } from "../../../test/support/vscode-fake";
import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import { Endpoint } from "../../shared/rpc/endpoint";
import type { Navigation, PanelShell } from "../../shared/host";
import type { VaultIndex } from "../vault/api";
import { linksHost } from "./host";
import { protocol } from "./protocol";

test("links host owns handlers, fixes source identity, confirms schemes and routes side and tab opens", async () => {
  let a: (value: unknown) => void = () => {};
  let b: (value: unknown) => void = () => {};
  const host = new Endpoint(
    {
      send: (value) => b(value),
      listen(fn) {
        a = fn;
        return () => {};
      },
    },
    {
      after() {
        return () => {};
      },
    },
  );
  const client = new Endpoint(
    {
      send: (value) => a(value),
      listen(fn) {
        b = fn;
        return () => {};
      },
    },
    {
      after() {
        return () => {};
      },
    },
  );
  const root = createRoot();
  const opens: unknown[] = [];
  const confirms: string[] = [];
  const navigation: Navigation = {
    scheme: "vscode",
    registerReveal: () => () => {},
    registerNativeLinks: () => () => {},
    external: async (href) => {
      opens.push(href);
      return true;
    },
    confirm: async (message) => {
      confirms.push(message);
      return false;
    },
    resolve: async (request) => {
      opens.push(request);
      return "file:///vault/New.md";
    },
    open: async (...args) => {
      opens.push(args);
    },
  };
  root.provide("resources", {
    async load() {
      throw new Error("unused");
    },
  });
  root.provide("rpc", host);
  provideHostServices(root, fakeHost({ navigation }));
  root.provide("vault", {
    root: "file:///vault",
    resolveLink: () => undefined,
    classifyLink: () => undefined,
    unresolvedLinks: () => new Map(),
    onDidResolve: () => () => {},
  } as unknown as VaultIndex);
  const panel = {
    document: { uri: "file:///vault/Note.md" },
    active: () => true,
  } as PanelShell;
  const enable = () => root.plugin(linksHost, { panel });
  let fiber = enable();
  await root.settled();
  assert.equal(fiber.state, "active");
  await client.call(protocol, "open", {
    href: "https://example.com",
    wiki: false,
    side: false,
  });
  assert.equal(opens[0], "https://example.com");
  assert.equal(
    await client.call(protocol, "open", {
      href: "zotero://select",
      wiki: false,
      side: false,
    }),
    false,
  );
  assert.equal(confirms.length, 1);
  await assert.rejects(
    client.call(protocol, "open", {
      href: "command:evil",
      wiki: false,
      side: false,
    }),
  );
  await client.call(protocol, "open", {
    href: "New#Heading",
    wiki: true,
    side: true,
  });
  assert.deepEqual(opens.at(-1), [
    "file:///vault",
    "file:///vault/New.md",
    "Heading",
    "side",
    undefined,
    undefined,
  ]);
  assert.equal((opens.at(-2) as { source: string }).source, panel.document.uri);
  // open({ tab }) still supports a kept tab; Mod-click now follows here (BH-020).
  for (const [tab, place] of [
    [true, "tab"],
    [false, "here"],
  ] as const) {
    await client.call(protocol, "open", {
      href: "New",
      wiki: true,
      side: false,
      tab,
    });
    assert.equal((opens.at(-1) as unknown[])[3], place);
  }
  // Host GUI: basename MD (with/without .md) create+open; relative stay open-only.
  for (const href of ["MissingNote", "MissingNote.md"] as const) {
    opens.length = 0;
    await client.call(protocol, "open", {
      href,
      wiki: false,
      side: false,
    });
    const created = opens[0] as unknown as { create: boolean; path: string };
    assert.equal(created.create, true, href);
    assert.equal(created.path, href, href);
  }
  for (const href of ["folder/Missing", "./no-such-relative"] as const) {
    opens.length = 0;
    await client.call(protocol, "open", {
      href,
      wiki: false,
      side: false,
    });
    assert.equal(
      (opens[0] as unknown as { create: boolean }).create,
      false,
      href,
    );
  }
  await fiber.dispose();
  await assert.rejects(
    client.call(protocol, "open", { href: "x", wiki: true, side: false }),
  );
  fiber = enable();
  await root.settled();
  assert.equal(fiber.state, "active");
  await client.call(protocol, "open", {
    href: "https://example.com",
    wiki: false,
    side: false,
  });
  await root.dispose();
  host.dispose();
  client.dispose();
});
