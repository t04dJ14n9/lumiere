import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { MARKDOWN_EDITOR, type PanelShell } from "@workshop/markdown/portable";
import { NoteDocuments, noteFiles } from "../../src/host/documents";
import { createNodePlatform } from "../../src/host/node-platform";
import { PanelHub } from "../../src/host/panels";
import type { PageSocket } from "../../src/host/panel";

const urls = () => ({
  cspSource: "'self'",
  asset: (relative: string) => `/lumiere/m/${relative}`,
  resource: (uri: string) => `/lumiere/file?uri=${uri}`,
});

function fakeSocket() {
  const sent: unknown[] = [];
  let receive: (text: string) => void = () => {};
  let closed: () => void = () => {};
  const socket: PageSocket = {
    send: (text) => sent.push(JSON.parse(text)),
    onMessage: (listener) => {
      receive = listener;
      return () => {};
    },
    onClose: (listener) => {
      closed = listener;
      return () => {};
    },
    close: () => closed(),
  };
  return {
    socket,
    sent,
    page: (frame: unknown) => receive(JSON.stringify(frame)),
    drop: () => closed(),
  };
}

async function setup(t: test.TestContext, connectTimeout?: number) {
  const dir = await mkdtemp(path.join(tmpdir(), "lumiere-panels-"));
  await writeFile(path.join(dir, "Note.md"), "hello");
  const uri = pathToFileURL(path.join(dir, "Note.md")).toString();
  const documents = new NoteDocuments(
    noteFiles(createNodePlatform({ data: tmpdir(), workers: "" })),
    60_000,
  );
  const hub = new PanelHub(documents, connectTimeout);
  const shells: PanelShell[] = [];
  hub.register(MARKDOWN_EDITOR, (shell) => {
    shells.push(shell);
    shell.setHTML("<html>editor</html>");
  });
  t.after(async () => {
    hub.dispose();
    await documents.dispose();
    await rm(dir, { recursive: true, force: true });
  });
  return { uri, documents, hub, shells };
}

test("a page gets the editor's HTML, and frames sent before it connects wait for it", async (t) => {
  const { uri, hub, shells } = await setup(t);
  const { id, html } = await hub.open({ uri, urls });
  assert.equal(html, "<html>editor</html>");
  const shell = shells[0]!;
  assert.equal(shell.document.getText(), "hello");
  shell.transport.send({ early: true });
  const page = fakeSocket();
  assert.equal(hub.attach(id, page.socket), true);
  assert.deepEqual(page.sent, [{ ch: "rpc", data: { early: true } }]);

  const received: unknown[] = [];
  shell.transport.listen((message) => received.push(message));
  page.page({ ch: "rpc", data: { from: "page" } });
  page.page({ ch: "nonsense" });
  assert.deepEqual(received, [{ from: "page" }]);
});

test("focus makes a panel active, and its questions are answered by id", async (t) => {
  const { uri, hub, shells } = await setup(t);
  const { id } = await hub.open({ uri, urls });
  const page = fakeSocket();
  hub.attach(id, page.socket);
  let changes = 0;
  hub.onActiveChanged(() => changes++);
  assert.equal(shells[0]!.active(), false);
  page.page({ ch: "ui", data: { type: "focus" } });
  assert.equal(shells[0]!.active(), true);
  assert.equal(changes, 1);

  const answer = hub.get(id)!.ask({
    type: "ask",
    id: 7,
    message: "Sure?",
    actions: ["Yes", "No"],
  });
  assert.deepEqual(page.sent.at(-1), {
    ch: "ui",
    data: { type: "ask", id: 7, message: "Sure?", actions: ["Yes", "No"] },
  });
  page.page({ ch: "ui", data: { type: "answer", id: 7, value: "Yes" } });
  assert.equal(await answer, "Yes");
});

test("a page that disconnects closes its panel, releases the note and answers null", async (t) => {
  const { uri, documents, hub, shells } = await setup(t);
  const { id } = await hub.open({ uri, urls });
  const page = fakeSocket();
  hub.attach(id, page.socket);
  let disposed = false;
  shells[0]!.onDispose(() => {
    disposed = true;
  });
  const pending = hub.get(id)!.ask({
    type: "input",
    id: 1,
    prompt: "Name",
    value: "",
  });
  page.drop();
  assert.equal(disposed, true);
  assert.equal(await pending, null);
  assert.equal(hub.get(id), undefined);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(documents.text(uri), undefined);
});

test("a page that never connects is dropped after the timeout", async (t) => {
  const { uri, hub } = await setup(t, 20);
  const { id } = await hub.open({ uri, urls });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(hub.get(id), undefined);
});
