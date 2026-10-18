import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import { provideHostServices } from "../../../src/shared/host";
import {
  EDIT_PROMPT_ARMED,
  registerEditPromptProbe,
  type EditPromptProbe,
} from "../../../src/plugins/cursorBridge/edit-prompt-probe";
import { fakeHost } from "../../support/vscode-fake";

async function fixture() {
  const root = createRoot();
  const contexts: unknown[][] = [];
  let probe: EditPromptProbe | undefined;
  provideHostServices(
    root,
    fakeHost({
      hostCommands: {
        async execute(id, ...args) {
          assert.equal(id, "setContext");
          contexts.push(args);
        },
      },
    }),
  );
  root.plugin({
    name: "probe-owner",
    inject: { required: ["views", "hostCommands"] },
    apply(ctx) {
      probe = registerEditPromptProbe(ctx);
    },
  });
  await root.settled();
  assert.ok(probe);
  return { root, probe, contexts };
}

test("the window probe stays armed until every handoff owner releases", async (t) => {
  const f = await fixture();
  t.after(() => f.root.dispose());
  const first = f.probe.arm();
  const second = f.probe.arm();
  first();
  first();
  assert.deepEqual(f.contexts, [
    [EDIT_PROMPT_ARMED, false],
    [EDIT_PROMPT_ARMED, true],
  ]);
  second();
  assert.deepEqual(f.contexts.at(-1), [EDIT_PROMPT_ARMED, false]);
  assert.equal(f.contexts.length, 3);
});

test("probe shutdown clears the key and stale owners cannot rearm it", async () => {
  const f = await fixture();
  const release = f.probe.arm();
  await f.root.dispose();
  release();
  f.probe.arm()();
  assert.deepEqual(f.contexts, [
    [EDIT_PROMPT_ARMED, false],
    [EDIT_PROMPT_ARMED, true],
    [EDIT_PROMPT_ARMED, false],
  ]);
});
