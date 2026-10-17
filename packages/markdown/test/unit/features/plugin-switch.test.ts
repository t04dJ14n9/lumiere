import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import type { Plugin } from "@workshop/core";
import { PluginSwitch } from "../../../src/shared/plugin-switch";

function recorder() {
  const log: string[] = [];
  const plugin = (name: string): Plugin<unknown> => ({
    name,
    apply(ctx, config) {
      log.push(`start ${name} ${JSON.stringify(config)}`);
      ctx.effect(() => () => void log.push(`stop ${name}`));
    },
    reconfigure(_ctx, config) {
      log.push(`update ${name} ${JSON.stringify(config)}`);
      return true;
    },
  });
  return { log, a: plugin("a"), b: plugin("b") };
}

test("starts wanted plugins, updates a changed configuration and stops the rest", async () => {
  const root = createRoot();
  const { log, a, b } = recorder();
  const plugins = new PluginSwitch(root);
  await plugins.update(["a", "b"], () => [
    { plugin: a, config: 1, signature: "1" },
    { plugin: b },
  ]);
  await root.settled();
  await plugins.update(["a", "b"], () => [
    { plugin: a, config: 2, signature: "2" },
  ]);
  await root.settled();
  await plugins.update(["a", "b"], () => [
    { plugin: a, config: 2, signature: "2" },
  ]);
  await root.settled();
  assert.deepEqual(log, [
    "start a 1",
    "start b undefined",
    "update a 2",
    "stop b",
  ]);
  await root.dispose();
});

test("updates run in order, a failed one does not block the next, and nothing runs after disposal", async () => {
  const root = createRoot({
    logger: { debug() {}, warn() {}, error() {} },
  });
  const { log, a } = recorder();
  const plugins = new PluginSwitch(root);
  const failed = plugins.update(["a"], () => {
    throw new Error("invalid settings");
  });
  const started = plugins.update(["a"], () => [{ plugin: a }]);
  await assert.rejects(failed, /invalid settings/);
  await started;
  await root.settled();
  assert.deepEqual(log, ["start a undefined"]);
  await root.dispose();
  await plugins.update(["a"], () => {
    throw new Error("must not be asked after disposal");
  });
  assert.deepEqual(log, ["start a undefined", "stop a"]);
});
