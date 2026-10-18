import assert from "node:assert/strict";
import { test } from "node:test";
import { StatusBarAfterZen } from "../../src/extension/plugins/pdfZen/status-bar";

/** The user's `workbench.statusBar.visible`, and every write to it. */
function userSetting(value: boolean | undefined) {
  const writes: (boolean | undefined)[] = [];
  return {
    writes,
    get: () => value,
    set: async (next: boolean | undefined) => {
      writes.push(next);
      value = next;
    },
    /** What Cursor does when zen hides the status bar. */
    zenHides: () => {
      value = false;
    },
  };
}

test("when zen saved the status bar as hidden (Cursor), leaving zen gives back the reader's value", async () => {
  for (const reader of [undefined, true]) {
    const setting = userSetting(reader);
    const statusBar = new StatusBarAfterZen(setting);
    statusBar.entering();
    setting.zenHides();
    await statusBar.left();
    assert.deepEqual(setting.writes, [reader]);
    assert.equal(setting.get(), reader);
  }
});

test("zen that leaves the setting alone (VS Code) is never written to", async () => {
  const setting = userSetting(undefined);
  const statusBar = new StatusBarAfterZen(setting);
  statusBar.entering();
  await statusBar.left();
  assert.deepEqual(setting.writes, []);
});

test("a reader who hides the status bar keeps it hidden", async () => {
  const setting = userSetting(false);
  const statusBar = new StatusBarAfterZen(setting);
  statusBar.entering();
  setting.zenHides();
  await statusBar.left();
  assert.deepEqual(setting.writes, []);
});

test("only the value from before the first entry is given back, once", async () => {
  const setting = userSetting(true);
  const statusBar = new StatusBarAfterZen(setting);
  statusBar.entering();
  setting.zenHides();
  // Asked again while zen is on: the hidden value is zen's, not the reader's.
  statusBar.entering();
  await statusBar.left();
  await statusBar.left();
  assert.deepEqual(setting.writes, [true]);
  // Leaving without entering does nothing.
  setting.zenHides();
  await statusBar.left();
  assert.deepEqual(setting.writes, [true]);
});
