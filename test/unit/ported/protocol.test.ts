import test from "node:test";
import assert from "node:assert/strict";
import { protocol as document } from "../../../src/plugins/document/protocol";
import { protocol as editor } from "../../../src/plugins/editor/protocol";
import { protocol as commands } from "../../../src/plugins/commands/protocol";
test("protocol rejects unknown actions and invalid message shapes", () => {
  assert.throws(() =>
    commands.requests.action.params.parse({
      action: "workbench.action.terminal.new",
    }),
  );
  assert.throws(() =>
    document.requests.push.params.parse({ version: -1, changes: [] }),
  );
  assert.throws(() =>
    document.requests.push.params.parse({
      version: 0,
      changes: Array(513).fill([]),
    }),
  );
  assert.throws(() =>
    editor.requests.ready.result.parse({ text: "note", version: 0 }),
  );
  assert.throws(() =>
    document.notifications.updates.parse({ version: 0, updates: [{}] }),
  );
});
