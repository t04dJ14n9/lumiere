import assert from "node:assert/strict";
import { test } from "node:test";
import "./support/install-fake-vscode";
import * as vscode from "./support/fake-vscode";
import { PdfPanel } from "../../src/extension/plugins/pdf/panel";
import { ViewPreferences } from "../../src/extension/plugins/pdf/view-preferences";
import { SAVED_POSITION_VERSION } from "../../src/shared/reading-position";
import { DEFAULT_VIEW_CHOICES } from "../../src/shared/view-settings";
import type { ViewState } from "../../src/shared/view-state";
import type { HostMessage } from "../../src/shared/messages";
import { nodeDigests } from "@workshop/platform/node";

function memory() {
  const values = new Map<string, unknown>();
  return {
    get: (key: string) => values.get(key),
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    },
    keys: () => [...values.keys()],
  };
}

function open(preferences: ViewPreferences) {
  // A memory URI avoids real disk watchers; the fake filesystem supplies bytes on ready.
  const uri = vscode.Uri.parse("memory://same.pdf") as never;
  const messages: HostMessage[] = [];
  let receive: ((value: unknown) => Promise<void>) | undefined;
  const panel = new PdfPanel(
    uri,
    {
      webview: {
        onDidReceiveMessage: (listener: typeof receive) => {
          receive = listener;
          return new vscode.Disposable(() => {
            receive = undefined;
          });
        },
        postMessage: async (message: HostMessage) => {
          messages.push(message);
          return true;
        },
        asWebviewUri: (uri: unknown) => uri,
      },
    } as never,
    {
      extensionUri: vscode.Uri.file("/extension") as never,
      digests: nodeDigests,
      toolbar: { mode: "chrome", dock: "bottom" },
      settings: preferences.settings(uri),
      position: preferences.position(uri),
      savePosition: (position) => preferences.save(uri, position),
      route: async () => undefined,
    },
  );
  return {
    panel,
    messages,
    receive: (message: unknown) => receive!(message),
    uri,
  };
}

const report = (page: number, zoom: number): ViewState => ({
  ...DEFAULT_VIEW_CHOICES,
  page,
  readingPage: page,
  pageCount: 12,
  zoomPercent: Math.round(zoom),
  zoom,
  fit: null,
  tool: "text",
  top: 20,
  left: 8,
  canGoBack: page > 1,
  canGoForward: page < 12,
});

test("same-file panels keep independent views; closing and reopening restores exact zoom and offsets", async () => {
  const preferences = new ViewPreferences(
    memory() as never,
    { all: [] } as never,
  );
  const first = open(preferences);
  const second = open(preferences);
  await first.receive({ type: "ready" });
  await second.receive({ type: "ready" });
  await first.receive({
    type: "patch",
    version: 1,
    load: 1,
    patch: { view: report(3, 125) },
  });
  const view = {
    ...report(6, 62.5),
    pageLayout: "spreadCover",
    scrollMode: "paged",
    scrollDirection: "horizontal",
  } as const;
  await second.receive({ type: "patch", version: 1, load: 1, patch: { view } });
  first.panel.dispose();
  assert.deepEqual(second.panel.view, view);
  assert.equal(preferences.position(first.uri)?.page, 3);
  second.panel.dispose();
  const reopened = open(preferences);
  await reopened.receive({ type: "ready" });
  assert.deepEqual(
    reopened.messages.find((message) => message.type === "load")?.position,
    {
      page: 6,
      top: 20,
      left: 8,
      zoom: 62.5,
      pageLayout: "spreadCover",
      scrollMode: "paged",
      scrollDirection: "horizontal",
    },
  );
  reopened.panel.dispose();
  preferences.dispose();
  assert.deepEqual(vscode.outstanding(), []);
});

test("view defaults inherit editor smoothScrolling and explicit PDF false overrides it", () => {
  vscode.configuration.set("editor.smoothScrolling", true);
  const preferences = new ViewPreferences(
    memory() as never,
    { all: [] } as never,
  );
  const uri = vscode.Uri.parse("memory://same.pdf") as never;
  assert.equal(preferences.settings(uri).smoothScrolling, true);
  vscode.configuration.set("pdfWorkshop.view.smoothScrolling", false);
  assert.equal(preferences.settings(uri).smoothScrolling, false);
  preferences.dispose();
  vscode.configuration.clear();
});

test("recreated webviews receive the current toolbar mode and dock after loading bytes", async () => {
  const preferences = new ViewPreferences(
    memory() as never,
    { all: [] } as never,
  );
  const viewer = open(preferences);
  await viewer.receive({ type: "ready" });
  for (const toolbar of [
    { mode: "slim", dock: "bottom" },
    { mode: "floating", dock: "right" },
  ] as const) {
    viewer.panel.setToolbar(toolbar);
    viewer.messages.length = 0;
    await viewer.receive({ type: "ready" });
    const loadIndex = viewer.messages.findIndex(
      (message) => message.type === "load",
    );
    const toolbarIndex = viewer.messages.findIndex(
      (message) => message.type === "toolbar",
    );
    assert.ok(loadIndex >= 0 && toolbarIndex > loadIndex);
    assert.deepEqual(viewer.messages[toolbarIndex], {
      type: "toolbar",
      toolbar,
    });
  }
  viewer.panel.dispose();
  preferences.dispose();
  assert.deepEqual(vscode.outstanding(), []);
});

test("loads are numbered for the life of the panel, so a new page that also got an earlier load still reports", async () => {
  const preferences = new ViewPreferences(
    memory() as never,
    { all: [] } as never,
  );
  const viewer = open(preferences);
  await viewer.receive({ type: "ready" });
  // A new page (the webview was rebuilt) says ready; the load sent to the old
  // page can reach it too, so it last received load 2, not 1.
  await viewer.receive({ type: "ready" });
  assert.deepEqual(
    viewer.messages.flatMap((message) =>
      message.type === "load" ? [message.load] : [],
    ),
    [1, 2],
  );
  await viewer.receive({
    type: "patch",
    version: 1,
    load: 1,
    patch: { view: report(3, 100) },
  });
  // Read through a function: an assertion would narrow the property's type.
  const view = () => viewer.panel.view;
  assert.equal(view(), undefined, "a patch about load 1 is stale");
  await viewer.receive({
    type: "patch",
    version: 2,
    load: 2,
    patch: { view: report(4, 100) },
  });
  assert.equal(view()?.page, 4);
  viewer.panel.dispose();
  preferences.dispose();
  assert.deepEqual(vscode.outstanding(), []);
});

test("saved positions carry a schema version; other versions and malformed values are ignored", async () => {
  const state = memory();
  const preferences = new ViewPreferences(state as never, { all: [] } as never);
  const uri = vscode.Uri.parse("memory://versioned.pdf") as never;
  const position = {
    page: 4,
    top: 1,
    left: 2,
    zoom: "fitWidth" as const,
    pageLayout: "spread" as const,
    scrollMode: "continuous" as const,
    scrollDirection: "vertical" as const,
  };
  preferences.save(uri, position);
  await new Promise((resolve) => setImmediate(resolve));
  const key = state.keys()[0]!;
  assert.equal(
    (state.get(key) as { version?: number }).version,
    SAVED_POSITION_VERSION,
  );
  assert.deepEqual(preferences.position(uri), position);
  for (const stored of [
    position, // saved by an older build, without a version
    { ...position, version: SAVED_POSITION_VERSION + 1 },
    { ...position, version: "1" },
    { version: SAVED_POSITION_VERSION, page: "4" },
    null,
    "garbage",
  ]) {
    await state.update(key, stored);
    assert.equal(preferences.position(uri), undefined, JSON.stringify(stored));
  }
  preferences.dispose();
});
