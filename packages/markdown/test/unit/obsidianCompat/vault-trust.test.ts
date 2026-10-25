import assert from "node:assert/strict";
import test from "node:test";
import { createRoot } from "@workshop/core";
import { obsidianCompatPanelHost } from "../../../src/plugins/obsidianCompat/panel-host";
import { provideHostServices } from "../../../src/shared/host";
import { fakeDocument, fakeHost } from "../../support/vscode-fake";

const VAULT = "file:///vault";

const FILES: Readonly<Record<string, string>> = {
  [`${VAULT}/.obsidian/community-plugins.json`]: JSON.stringify(["hello"]),
  [`${VAULT}/.obsidian/plugins/hello/manifest.json`]: JSON.stringify({
    id: "hello",
    name: "Hello",
    version: "1.0.0",
  }),
  [`${VAULT}/.obsidian/plugins/hello/main.js`]: "module.exports = {};",
};

interface Bootstrap {
  readonly trusted: boolean;
  readonly plugins: readonly { readonly id: string }[];
}

/** One open note in a vault that turns on one community plugin. */
async function openNote(answer: boolean | undefined) {
  const trust = { answer, asked: [] as [string, readonly string[]][] };
  const changes = new Set<() => void>();
  const handlers = new Map<string, () => Promise<unknown>>();
  const notified: { event: string; payload: unknown }[] = [];
  const host = fakeHost({
    workspace: {
      ...fakeHost().workspace,
      read: async (uri) => {
        const text = FILES[uri];
        if (text === undefined) {
          throw Object.assign(new Error("Missing"), { code: "FileNotFound" });
        }
        return new TextEncoder().encode(text);
      },
      files: {
        ...fakeHost().workspace.files,
        authorize: async () => {},
      },
      vaultCode: {
        answer: () => trust.answer,
        request: async (vaultRoot, plugins) => {
          trust.asked.push([vaultRoot, plugins]);
          return trust.answer === true;
        },
        onDidChange: (listener) => {
          changes.add(listener);
          return () => {
            changes.delete(listener);
          };
        },
      },
    },
  });
  const root = createRoot();
  provideHostServices(root, host);
  root.provide("rpc", {
    handle(_protocol: unknown, method: string, run: () => Promise<unknown>) {
      handlers.set(method, run);
      return () => handlers.delete(method);
    },
    notify(_protocol: unknown, event: string, payload: unknown) {
      notified.push({ event, payload });
    },
    on: () => () => {},
  } as never);
  root.provide("vault", {
    root: VAULT,
    files: () => [],
    file: () => undefined,
    onDidChange: () => () => {},
    resolveLink: () => undefined,
  } as never);
  const panel = {
    id: "panel-1",
    document: fakeDocument({ uri: `${VAULT}/Note.md` }),
  } as never;
  root.plugin(obsidianCompatPanelHost, { panel });
  await root.settled();
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
  return {
    trust,
    notified,
    settle,
    bootstrap: async () => (await handlers.get("bootstrap")!()) as Bootstrap,
    /** The owner answers, as the host's prompt would. */
    answer(value: boolean) {
      trust.answer = value;
      for (const listener of changes) {
        listener();
      }
    },
    dispose: () => root.dispose(),
  };
}

test("a vault that turns plugins on asks the owner first, and runs them only after a yes", async () => {
  const note = await openNote(undefined);
  const first = await note.bootstrap();
  await note.settle();
  assert.equal(first.trusted, false);
  assert.deepEqual(first.plugins, []);
  assert.deepEqual(note.trust.asked[0], [VAULT, ["hello"]]);

  note.notified.length = 0;
  note.answer(true);
  await note.settle();
  const change = note.notified.find((item) => item.event === "pluginsChanged");
  assert.ok(change, "the answer reloads the vault's plugins");
  const loaded = change.payload as Bootstrap;
  assert.equal(loaded.trusted, true);
  assert.deepEqual(
    loaded.plugins.map((plugin) => plugin.id),
    ["hello"],
  );
  await note.dispose();
});

test("an answered vault is not asked again", async () => {
  for (const answer of [true, false]) {
    const note = await openNote(answer);
    const loaded = await note.bootstrap();
    await note.settle();
    assert.equal(loaded.trusted, answer);
    assert.equal(loaded.plugins.length, answer ? 1 : 0);
    assert.deepEqual(note.trust.asked, []);
    await note.dispose();
  }
});
