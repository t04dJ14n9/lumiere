import assert from "node:assert/strict";
import { test } from "node:test";
import "./support/install-fake-vscode";
import * as vscode from "./support/fake-vscode";
import { PdfPanel } from "../../src/extension/plugins/pdf/panel";
import { followMenuContext, menuContext } from "../../src/webview/menu-context";
import type { HostMessage } from "../../src/shared/messages";

function open() {
  const messages: HostMessage[] = [];
  let receive: ((value: unknown) => Promise<void>) | undefined;
  const panel = new PdfPanel(
    vscode.Uri.parse("memory://paper.pdf") as never,
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
      toolbar: { mode: "chrome", dock: "bottom" },
      route: async () => undefined,
    } as never,
  );
  return { panel, messages, receive: (message: unknown) => receive!(message) };
}

/** Read through a call: an assert on the property narrows it for good. */
const selectionOf = (panel: PdfPanel) => panel.selection;

const text = {
  kind: "text",
  text: "Scaled dot-product attention",
  pages: [{ page: 1, rects: [[72, 83, 206, 104]] }],
};

test("Copy Link for Agent asks the viewer for a selection it has not reported, and waits for it", async () => {
  const { panel, messages, receive } = open();
  await receive({ type: "ready" });
  assert.equal(panel.selection, undefined);
  const ensured = panel.ensureSelection(5_000);
  assert.ok(messages.some((message) => message.type === "reportSelection"));
  await receive({
    type: "patch",
    version: 1,
    load: 1,
    patch: { selection: { selection: text } },
  });
  await ensured;
  assert.equal(selectionOf(panel)?.kind, "text");
  panel.dispose();
});

test("with no reply it gives up after the timeout; with a selection it asks nothing", async () => {
  const { panel, messages, receive } = open();
  await receive({ type: "ready" });
  const started = Date.now();
  await panel.ensureSelection(30);
  assert.ok(Date.now() - started >= 25);
  assert.equal(panel.selection, undefined);

  await receive({
    type: "patch",
    version: 1,
    load: 1,
    patch: { selection: { selection: text } },
  });
  const asked = messages.filter((m) => m.type === "reportSelection").length;
  await panel.ensureSelection(5_000);
  assert.equal(
    messages.filter((m) => m.type === "reportSelection").length,
    asked,
  );
  panel.dispose();
});

test("the context menu carries the viewer's selection as it is when the menu opens", () => {
  assert.equal(menuContext(true), '{"lumiere.pdf.hasSelection":true}');
  const attributes: Record<string, string> = {};
  const listeners: { type: string; listener: () => void; capture: unknown }[] =
    [];
  const doc = {
    body: {
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
    },
    addEventListener: (type: string, listener: () => void, capture: unknown) =>
      listeners.push({ type, listener, capture }),
    removeEventListener: (type: string, listener: () => void) => {
      const index = listeners.findIndex(
        (entry) => entry.type === type && entry.listener === listener,
      );
      listeners.splice(index, 1);
    },
  };
  let selected = false;
  const stop = followMenuContext(doc as never, () => selected);
  assert.deepEqual(
    listeners.map(({ type, capture }) => [type, capture]),
    [["contextmenu", true]],
  );
  selected = true;
  listeners[0]!.listener();
  assert.equal(
    attributes["data-vscode-context"],
    '{"lumiere.pdf.hasSelection":true}',
  );
  selected = false;
  listeners[0]!.listener();
  assert.equal(
    attributes["data-vscode-context"],
    '{"lumiere.pdf.hasSelection":false}',
  );
  stop();
  assert.equal(listeners.length, 0);
});
