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
  const require = createRequire(import.meta.url);
  // Each test brings its own fake: load the host modules again for it.
  for (const id of Object.keys(require.cache)) {
    if (id.includes("/src/host/") || id.includes("/src/shared/")) {
      delete require.cache[id];
    }
  }
  try {
    return require("../../../src/host/navigation.ts") as typeof HostNavigation;
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
  const oldOpen = navigation.open(
    root,
    stale,
    "",
    "here",
    undefined,
    oldIntent,
  );
  await warmingStarted;
  assert.deepEqual(commands, []);

  await navigation.open(root, current, "", "here");
  assert.equal(oldIntent.token.cancelled, true);
  finishWarm();
  await oldOpen;
  assert.deepEqual(warmed, [stale, current]);
  assert.deepEqual(commands, [
    ["vscode.openWith", current, MARKDOWN_EDITOR.viewType, 1],
  ]);
});

test("a link to a PDF opens it in PDF Workshop at its page, beside when asked", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mw-navigation-unit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = pathToFileURL(directory).href;
  const pdf = pathToFileURL(join(directory, "paper.pdf")).href;
  const commands: unknown[][] = [];
  const withFragment = (uri: string) =>
    Object.assign(parseUri(uri), {
      with: ({ fragment }: { fragment: string }) =>
        withFragment(`${uri.split("#")[0]}${fragment ? `#${fragment}` : ""}`),
    });
  const { createNavigation, PDF_OPEN_LOCATION_COMMAND } = loadNavigation({
    Uri: { parse: withFragment },
    ViewColumn: { Beside: -2 },
    env: { appName: "Visual Studio Code", uriScheme: "vscode" },
    window: { tabGroups: { activeTabGroup: { viewColumn: 1 } } },
    workspace: { getConfiguration: () => ({ get: () => "on" }) },
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
  await navigation.open(root, pdf, "page=3", "here");
  await navigation.open(root, pdf, "page=5&viewrect=1,2,3,4", "side");
  // Not a PDF location (a heading, say): open the PDF where it was left.
  await navigation.open(root, pdf, "Introduction", "here");
  assert.deepEqual(commands, [
    [PDF_OPEN_LOCATION_COMMAND, `${pdf}#page=3`, undefined, { viewColumn: 1 }],
    [
      PDF_OPEN_LOCATION_COMMAND,
      `${pdf}#page=5&viewrect=1,2,3,4`,
      undefined,
      { viewColumn: -2 },
    ],
    [PDF_OPEN_LOCATION_COMMAND, pdf, undefined, { viewColumn: 1 }],
  ]);
});

test("a Cmd-clicked link opens a tab VS Code keeps, not the preview the next link replaces", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mw-navigation-unit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = pathToFileURL(directory).href;
  const note = pathToFileURL(join(directory, "Note.md")).href;
  const file = pathToFileURL(join(directory, "data.csv")).href;
  const commands: unknown[][] = [];
  const withFragment = (uri: string) =>
    Object.assign(parseUri(uri), {
      with: ({ fragment }: { fragment: string }) =>
        withFragment(`${uri.split("#")[0]}${fragment ? `#${fragment}` : ""}`),
    });
  const { createNavigation } = loadNavigation({
    Uri: { parse: withFragment },
    ViewColumn: { Beside: -2 },
    env: { appName: "Visual Studio Code", uriScheme: "vscode" },
    window: { tabGroups: { activeTabGroup: { viewColumn: 1 } } },
    workspace: {
      getConfiguration: () => ({ get: () => "on" }),
      async openTextDocument() {},
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
  await navigation.open(root, note, "", "here");
  await navigation.open(root, note, "", "tab");
  await navigation.open(root, file, "", "tab");
  assert.deepEqual(commands, [
    ["vscode.openWith", note, MARKDOWN_EDITOR.viewType, 1],
    [
      "vscode.openWith",
      note,
      MARKDOWN_EDITOR.viewType,
      { viewColumn: 1, preview: false },
    ],
    ["vscode.open", file, { viewColumn: 1, preview: false }],
  ]);
});
