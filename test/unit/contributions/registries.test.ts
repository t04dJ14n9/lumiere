import assert from "node:assert/strict";
import test from "node:test";
import type { ProcessorResult } from "../../../src/plugins/codeBlocks/api";
import { ActionRegistry } from "../../../src/plugins/editor/actions";
import { ProcessorRegistry } from "../../../src/plugins/codeBlocks/processors";
import { CancelToken } from "../../../src/shared/rpc/lifecycle";
import { fixture } from "../agent-bridge/fixture";

test("actions keep callbacks host-side, capture authentic selections and remove only their owner", async () => {
  const f = fixture();
  const registry = new ActionRegistry(
    f.editors,
    f.selections,
    f.workbench,
    () => {},
  );
  let invoked = 0;
  const run = async ({
    selection,
  }: Parameters<Parameters<typeof registry.register>[1]["run"]>[0]) => {
    assert.ok(selection);
    assert.equal(f.selections.validate(selection), f.panel);
    invoked++;
  };
  const action = {
    id: "inspect",
    label: "Inspect",
    scope: "selection" as const,
    run,
  };
  registry.register("a", action);
  registry.register("b", action);
  assert.throws(() => registry.register("a", action), {
    code: "DuplicateContribution",
  });
  assert.deepEqual(registry.list().map(Object.keys), [
    ["owner", "id", "label", "scope"],
    ["owner", "id", "label", "scope"],
  ]);
  assert.equal(
    await registry.run("panel", "a", "inspect", new CancelToken()),
    true,
  );
  assert.equal(invoked, 1);
  registry.clearOwner("a");
  assert.equal(
    await registry.run("panel", "a", "inspect", new CancelToken()),
    false,
  );
  assert.deepEqual(
    registry.list().map((item) => item.owner),
    ["b"],
  );
  registry.dispose();
  assert.throws(() => registry.register("c", action), {
    code: "PluginDisabled",
  });
  await f.pair.dispose();
});

test("action removal during selection capture prevents a late callback", async () => {
  const f = fixture();
  const registry = new ActionRegistry(
    f.editors,
    f.selections,
    f.workbench,
    () => {},
  );
  registry.register("a", {
    id: "inspect",
    label: "Inspect",
    scope: "selection",
    run() {
      assert.fail("disposed action ran");
    },
  });
  f.beforeCapture(() => registry.clearOwner("a"));
  await assert.rejects(
    registry.run("panel", "a", "inspect", new CancelToken()),
    { code: "Cancelled" },
  );
  await f.pair.dispose();
});

test("processor ownership, case-insensitive duplicates, generations and result validation", async () => {
  const registry = new ProcessorRegistry(() => {});
  const token = new CancelToken();
  const request = () => ({
    language: "diagram",
    source: "body",
    uri: "file:///note.md",
    sourceLine: 0,
    editorId: "one",
    ...registry.snapshot(),
  });
  const stop = registry.register("a", {
    language: "Diagram",
    render: async (source) => ({ markdown: source }),
  });
  assert.throws(
    () =>
      registry.register("b", {
        language: "diagram",
        render: async () => ({ html: "" }),
      }),
    { code: "DuplicateContribution" },
  );
  assert.deepEqual(await registry.render(request(), token), {
    markdown: "body",
  });
  const old = request();
  stop();
  registry.register("b", {
    language: "diagram",
    render: async () =>
      ({
        html: "safe",
        markdown: "invalid",
      }) as unknown as ProcessorResult,
  });
  await assert.rejects(registry.render(old, token), { code: "SourceChanged" });
  await assert.rejects(
    registry.render(request(), token),
    /Supply Markdown or HTML/,
  );
  registry.clearOwner("a");
  assert.deepEqual(registry.snapshot().languages, ["diagram"]);
  registry.dispose();
  await assert.rejects(registry.render(request(), token), {
    code: "PluginDisabled",
  });
});

test("disabled pane and disposed in-flight processor cannot return output", async () => {
  const registry = new ProcessorRegistry(() => {});
  let finish = (_value: { html: string }) => {};
  registry.register("a", {
    language: "diagram",
    isAvailable: (id) => id === "one",
    render: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const request = {
    language: "diagram",
    source: "",
    uri: "file:///note.md",
    sourceLine: 0,
    editorId: "one",
    ...registry.snapshot(),
  };
  assert.deepEqual(registry.snapshot("two").languages, []);
  await assert.rejects(
    registry.render({ ...request, editorId: "two" }, new CancelToken()),
    { code: "PluginDisabled" },
  );
  const result = registry.render(request, new CancelToken());
  registry.clearOwner("a");
  finish({ html: "late" });
  await assert.rejects(result, { code: "Cancelled" });
});
