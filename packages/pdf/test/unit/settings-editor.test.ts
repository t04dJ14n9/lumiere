import assert from "node:assert/strict";
import { test } from "node:test";
import { openSettingsEditor } from "../../src/extension/settings-editor";

test("the Settings editor opens through runCommands, so its result never crosses to the extension", async () => {
  const calls: unknown[][] = [];
  await openSettingsEditor(async (...call: unknown[]) => {
    calls.push(call);
    return undefined;
  }, "lumiere.pdf.view.defaultZoom");
  assert.deepEqual(calls, [
    [
      "runCommands",
      {
        commands: [
          {
            command: "workbench.action.openSettings",
            args: "lumiere.pdf.view.defaultZoom",
          },
        ],
      },
    ],
  ]);
});
