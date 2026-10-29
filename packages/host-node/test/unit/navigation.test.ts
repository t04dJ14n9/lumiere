import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import {
  MARKDOWN_EDITOR,
  type HostSettings,
  type PanelShell,
} from "@workshop/markdown/portable";
import { NoteDocuments, noteFiles } from "../../src/host/documents";
import { createNodePlatform, nodeFiles } from "../../src/host/node-platform";
import { createHostNavigation, resolveLink } from "../../src/host/navigation";
import type { PageSocket } from "../../src/host/panel";
import { PanelHub } from "../../src/host/panels";

const settings = { get: () => "" } as unknown as HostSettings;

async function vault(t: test.TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), "lumiere-nav-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const note = path.join(dir, "Note.md");
  await writeFile(note, "hello");
  return {
    dir,
    note,
    root: pathToFileURL(dir).toString(),
    source: pathToFileURL(note).toString(),
  };
}

test("creating a note stays inside the workspace and does not follow a symlink out", async (t) => {
  const { dir, root, source } = await vault(t);
  const outside = await mkdtemp(path.join(tmpdir(), "lumiere-nav-out-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, path.join(dir, "out"));
  const request = {
    root,
    source,
    create: true,
    folderNote: "",
  };
  await assert.rejects(
    () => resolveLink(nodeFiles, { ...request, path: "../outside.md" }),
    /outside the vault/,
  );
  await assert.rejects(
    () => resolveLink(nodeFiles, { ...request, path: "out/New.md" }),
    /outside the vault/,
  );
  assert.equal(
    await readFile(path.join(outside, "New.md"), "utf8").catch(() => ""),
    "",
  );

  const created = await resolveLink(nodeFiles, { ...request, path: "Made.md" });
  assert.equal(created, pathToFileURL(path.join(dir, "Made.md")).toString());
  assert.equal(await readFile(path.join(dir, "Made.md"), "utf8"), "");
  await writeFile(path.join(dir, "Made.md"), "keep");
  await resolveLink(nodeFiles, { ...request, path: "Made.md" });
  assert.equal(await readFile(path.join(dir, "Made.md"), "utf8"), "keep");

  const createdMarkdown = await resolveLink(nodeFiles, {
    ...request,
    path: "NoteTwo.markdown",
  });
  assert.equal(
    createdMarkdown,
    pathToFileURL(path.join(dir, "NoteTwo.markdown")).toString(),
  );
  assert.equal(await readFile(path.join(dir, "NoteTwo.markdown"), "utf8"), "");
});

test("a link to a note open in another tab asks that tab to come forward", async (t) => {
  const { dir, root } = await vault(t);
  const other = path.join(dir, "Other.md");
  await writeFile(other, "there");
  const firstUri = pathToFileURL(path.join(dir, "Note.md")).toString();
  const otherUri = pathToFileURL(other).toString();
  const documents = new NoteDocuments(
    noteFiles(createNodePlatform({ data: tmpdir(), workers: "" })),
    60_000,
  );
  const hub = new PanelHub(documents);
  const shells: PanelShell[] = [];
  hub.register(MARKDOWN_EDITOR, (shell) => {
    shells.push(shell);
    shell.setHTML("<html></html>");
  });
  t.after(async () => {
    hub.dispose();
    await documents.dispose();
  });
  const urls = () => ({
    cspSource: "'self'",
    asset: (relative: string) => relative,
    resource: (uri: string) => uri,
  });
  const first = await hub.open({ uri: firstUri, urls });
  const second = await hub.open({ uri: otherUri, urls });
  const page = socket();
  const hidden = socket();
  hub.attach(first.id, page.socket);
  hub.attach(second.id, hidden.socket);
  page.receive('{"ch":"ui","data":{"type":"focus"}}');

  await createHostNavigation(nodeFiles, hub, settings, {
    appName: "DeepSeek Harness",
    uriScheme: "dsh",
  }).open(root, otherUri, "", "here");
  const opens = page.sent.filter(
    (frame) =>
      typeof frame === "object" &&
      frame !== null &&
      (frame as { ch?: string }).ch === "ui",
  );
  assert.deepEqual(opens.at(-1), {
    ch: "ui",
    data: {
      type: "open",
      path: other,
      fragment: "",
    },
  });
  assert.equal(
    hidden.sent.some((frame) => JSON.stringify(frame).includes('"open"')),
    false,
  );
});

function socket() {
  const sent: unknown[] = [];
  let receive: (text: string) => void = () => {};
  const endpoint: PageSocket = {
    send: (text) => sent.push(JSON.parse(text)),
    onMessage: (listener) => {
      receive = listener;
      return () => {};
    },
    onClose: () => () => {},
    close: () => {},
  };
  return { socket: endpoint, sent, receive: (text: string) => receive(text) };
}

test("revealing in a hidden tab that focuses itself still tells the presenting tab to switch", async (t) => {
  const { dir, root } = await vault(t);
  const other = path.join(dir, "Other.md");
  await writeFile(other, "# Heading\nthere");
  const firstUri = pathToFileURL(path.join(dir, "Note.md")).toString();
  const otherUri = pathToFileURL(other).toString();
  const documents = new NoteDocuments(
    noteFiles(createNodePlatform({ data: tmpdir(), workers: "" })),
    60_000,
  );
  const hub = new PanelHub(documents);
  hub.register(MARKDOWN_EDITOR, (shell) => {
    shell.setHTML("<html></html>");
  });
  t.after(async () => {
    hub.dispose();
    await documents.dispose();
  });
  const urls = () => ({
    cspSource: "'self'",
    asset: (relative: string) => relative,
    resource: (uri: string) => uri,
  });
  const first = await hub.open({ uri: firstUri, urls });
  const second = await hub.open({ uri: otherUri, urls });
  const page = socket();
  const hidden = socket();
  hub.attach(first.id, page.socket);
  hub.attach(second.id, hidden.socket);
  page.receive('{"ch":"ui","data":{"type":"focus"}}');

  const nav = createHostNavigation(nodeFiles, hub, settings, {
    appName: "DeepSeek Harness",
    uriScheme: "dsh",
  });
  nav.registerReveal({
    id: second.id,
    uri: otherUri,
    active: () => hub.active()?.id === second.id,
    reveal: async () => {
      // Simulate CodeMirror view.focus() firing inside the hidden iframe during reveal.
      hidden.receive('{"ch":"ui","data":{"type":"focus"}}');
      return true;
    },
  });

  await nav.open(root, otherUri, "Heading", "here");
  const opens = page.sent.filter(
    (frame) =>
      typeof frame === "object" &&
      frame !== null &&
      (frame as { ch?: string }).ch === "ui",
  );
  assert.deepEqual(opens.at(-1), {
    ch: "ui",
    data: {
      type: "open",
      path: other,
      fragment: "Heading",
    },
  });
  assert.equal(hub.active()?.id, second.id);
});
