import test from "node:test";
import assert from "node:assert/strict";
import { createCommands } from "./registry";

test("command registration preserves async results, duplicate rejection and removal", async () => {
  const commands = createCommands();
  assert.equal(await commands.run("missing"), false);
  const remove = commands.register("test", async () => true);
  assert.equal(await commands.run("test"), true);
  assert.throws(
    () => commands.register("test", () => false),
    /Duplicate command test/,
  );
  await remove();
  assert.equal(await commands.run("test"), false);
  commands.register("test", () => false);
  assert.equal(await commands.run("test"), false);
  commands.register("throws", () => {
    throw new Error("command failure");
  });
  await assert.rejects(commands.run("throws"), /command failure/);
});
