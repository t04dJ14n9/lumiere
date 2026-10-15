import test from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type * as HostNavigation from "../../../src/host/navigation";
import { MARKDOWN_EDITOR } from "../../../src/shared/editor-provider";

function loadNavigation(vscode: unknown) {
  const loader = Module as typeof Module & {
    _load(id: string, ...args: unknown[]): unknown;
  };
  const originalLoad = loader._load;
  loader._load = (id, ...args) =>
    id === "vscode" ? vscode : originalLoad.call(Module, id, ...args);
  try {
    return createRequire(import.meta.url)(
      "../../../src/host/navigation.ts",
    ) as typeof HostNavigation;
  } finally {
    loader._load = originalLoad;
  }
}

function parseUri(uri: string) {
  const url = new URL(uri);
  return {
    scheme: url.protocol.slice(0, -1),
    authority: url.host,
    path: decodeURIComponent(url.pathname),
    fsPath: fileURLToPath(url),
    toString: () => url.href,
  };
}

test("navigation superseded during document warming does not open the old note", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mw-navigation-unit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = pathToFileURL(directory).href;
  const stale = pathToFileURL(join(directory, "Old.md")).href;
  const current = pathToFileURL(join(directory, "New.markdown")).href;
  const warmed: string[] = [];
  const commands: unknown[][] = [];
  let finishWarm = () => {};
  let notifyWarming = () => {};
  const warmPending = new Promise<void>((resolve) => {
    finishWarm = resolve;
  });
  const warmingStarted = new Promise<void>((resolve) => {
    notifyWarming = resolve;
  });
  t.after(() => finishWarm());
  const { createNavigation } = loadNavigation({
    Uri: { parse: parseUri },
    env: { appName: "Cursor", uriScheme: "vscode" },
    window: { tabGroups: { activeTabGroup: { viewColumn: 1 } } },
    workspace: {
      getConfiguration: () => ({ get: () => "on" }),
      async openTextDocument(uri: ReturnType<typeof parseUri>) {
        warmed.push(uri.toString());
        if (uri.toString() === stale) {
          notifyWarming();
          await warmPending;
        }
      },
    },
    commands: {
      async executeCommand(
        command: string,
        uri: ReturnType<typeof parseUri>,
        ...args: unknown[]
      ) {
        commands.push([command, uri.toString(), ...args]);
      },
    },
  });
  const navigation = createNavigation(() => []);
  const oldIntent = navigation.begin!();
  const oldOpen = navigation.open(root, stale, "", false, undefined, oldIntent);
  await warmingStarted;
  assert.deepEqual(commands, []);

  await navigation.open(root, current, "", false);
  assert.equal(oldIntent.token.cancelled, true);
  finishWarm();
  await oldOpen;
  assert.deepEqual(warmed, [stale, current]);
  assert.deepEqual(commands, [
    ["vscode.openWith", current, MARKDOWN_EDITOR.viewType, 1],
  ]);
});
