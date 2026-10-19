import test from "node:test";
import assert from "node:assert/strict";
import { openSettingsEditor } from "../../src/host/settings-editor";

test("the Settings editor opens through runCommands, so its result never crosses to the extension", async () => {
  const calls: unknown[][] = [];
  const execute = async (...call: unknown[]) => {
    calls.push(call);
    return undefined;
  };
  await openSettingsEditor(execute, "@ext:t04dj14n9.lumiere");
  const resource = { scheme: "file", path: "/vault" } as never;
  await openSettingsEditor(execute, { query: "@ext:x plugins", resource });
  assert.deepEqual(calls, [
    [
      "runCommands",
      {
        commands: [
          {
            command: "workbench.action.openSettings",
            args: "@ext:t04dj14n9.lumiere",
          },
        ],
      },
    ],
    [
      "runCommands",
      {
        commands: [
          {
            command: "workbench.action.openSettings",
            args: { query: "@ext:x plugins", resource },
          },
        ],
      },
    ],
  ]);
});
