import assert from "node:assert/strict";
import test from "node:test";
import {
  createOutlineFocus,
  LEAVE_RESTORE_MS,
  NATIVE_OUTLINE_ID,
  TAGS_VIEW_ID,
} from "../../../src/plugins/outline/focus";
import { VIEW_ID } from "../../../src/plugins/outline/commands";

test("entering a Workshop editor hides native Outline and shows ours plus Tags", async () => {
  const executed: string[] = [];
  const focus = createOutlineFocus({
    execute: async (command) => {
      executed.push(command);
    },
    focusEditor: async () => {
      executed.push("focusEditor");
    },
    schedule: () => ({ dispose() {} }),
  });
  focus.sync(true);
  await settle();
  assert.deepEqual(executed, [
    `${NATIVE_OUTLINE_ID}.removeView`,
    `${VIEW_ID}.focus`,
    `${TAGS_VIEW_ID}.focus`,
    "focusEditor",
  ]);
  executed.length = 0;
  focus.sync(true);
  await settle();
  assert.deepEqual(executed, [], "re-enter is a no-op while still engaged");
  focus.dispose();
});

test("leaving restores native Outline after the debounce window", async () => {
  const executed: string[] = [];
  let pending: (() => void) | undefined;
  const focus = createOutlineFocus({
    execute: async (command) => {
      executed.push(command);
    },
    focusEditor: async () => {
      executed.push("focusEditor");
    },
    leaveDelayMs: LEAVE_RESTORE_MS,
    schedule: (run) => {
      pending = run;
      return {
        dispose() {
          pending = undefined;
        },
      };
    },
  });
  focus.sync(true);
  await settle();
  executed.length = 0;
  focus.sync(false);
  assert.equal(typeof pending, "function");
  assert.deepEqual(executed, [], "restore waits for the debounce");
  pending!();
  await settle();
  assert.deepEqual(executed, [`${NATIVE_OUTLINE_ID}.focus`, "focusEditor"]);
  focus.dispose();
});

test("a quick re-enter cancels the pending native Outline restore", async () => {
  const executed: string[] = [];
  let pending: (() => void) | undefined;
  const focus = createOutlineFocus({
    execute: async (command) => {
      executed.push(command);
    },
    focusEditor: async () => {
      executed.push("focusEditor");
    },
    schedule: (run) => {
      pending = run;
      return {
        dispose() {
          pending = undefined;
        },
      };
    },
  });
  focus.sync(true);
  await settle();
  executed.length = 0;
  focus.sync(false);
  focus.sync(true);
  assert.equal(pending, undefined, "leave timer cleared on re-enter");
  await settle();
  assert.deepEqual(
    executed,
    [],
    "still engaged: no second enter and no restore",
  );
  focus.dispose();
});

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
