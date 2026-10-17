import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import { commandsHost } from "../../../src/plugins/commands/host";
import { contributionId } from "../../../src/shared/setting-schema";
import { fakeWorkbench, fakeDocument } from "../../support/vscode-fake";
import type { EditorPanel } from "../../../src/plugins/editor/api";
import folding from "../../../src/plugins/folding/manifest";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const foldAll = contributionId("foldAll");

test("host feature commands disappear when disabled and target the current panel after switching", async () => {
  const root = createRoot();
  const commands = new Map<string, () => unknown>();
  const calls: string[] = [];
  const panel = (id: string) =>
    ({
      id,
      document: fakeDocument(),
      rpc: {
        async call() {
          calls.push(id);
          return true;
        },
      },
    }) as unknown as EditorPanel;
  let active: EditorPanel | undefined = panel("one");
  let enabled = true;
  let changed = () => {};
  root.provide("editors", {
    all: () => [],
    active: () => active,
    async capture() {
      throw new Error("unused");
    },
    async restore() {},
  });
  root.provide(
    "workshop",
    fakeWorkbench({
      command(id, run) {
        assert.equal(commands.has(id), false);
        commands.set(id, run);
        return () => {
          commands.delete(id);
        };
      },
      config: () => ({
        preset: "obsidian",
        mode: "source",
        features: { folding: { enabled, config: {} } },
      }),
      onConfiguration(listener) {
        changed = listener;
        return () => {
          changed = () => {};
        };
      },
    }),
  );
  root.plugin(commandsHost, { features: [folding] });
  await root.settled();
  await tick();
  assert.ok(commands.has(foldAll));
  await commands.get(foldAll)!();
  active = panel("two");
  await commands.get(foldAll)!();
  assert.deepEqual(calls, ["one", "two"]);
  enabled = false;
  changed();
  await tick();
  assert.equal(commands.has(foldAll), false);
  enabled = true;
  changed();
  await tick();
  assert.ok(commands.has(foldAll));
  active = undefined;
  root.emit("editor/activeChanged", undefined);
  await tick();
  assert.equal(commands.has(foldAll), false);
  await root.dispose();
  assert.equal(commands.size, 0);
});
