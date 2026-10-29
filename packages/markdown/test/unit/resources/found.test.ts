import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import type { Resources } from "../../../src/plugins/resources/api";
import { resourcesHost } from "../../../src/plugins/resources/host";
import { resourcesWebview } from "../../../src/plugins/resources/webview";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";
import { provideHostServices } from "../../../src/shared/host";
import type { PanelShell } from "../../../src/shared/host";
import { fakeHost } from "../../support/vscode-fake";
import { rpcPair } from "../../support/rpc-pair";

const ROOT = "file:///vault";
const NOTE = `${ROOT}/Note.md`;

function file(path: string) {
  return { uri: `${ROOT}/${path}`, path, mtime: 7, size: 1 };
}

/** A note's panel and its page, with the vault index the host reads. */
async function notePage() {
  const pair = rpcPair();
  const vault = new MemoryVaultIndex({
    root: ROOT,
    folderNote: "",
    linkFormat: "shortest",
  });
  vault.replaceFiles([file("Note.md")]);
  const host = createRoot();
  provideHostServices(
    host,
    fakeHost({
      workspace: { stat: async () => ({ mtime: 7, symbolicLink: false }) },
    }),
  );
  host.provide("rpc", pair.host);
  host.provide("vault", vault);
  host.plugin(resourcesHost, {
    panel: {
      document: { uri: NOTE },
      resource: (uri: string) => uri,
    } as unknown as PanelShell,
  });
  const page = createRoot();
  page.provide("rpc", pair.client);
  page.plugin(resourcesWebview);
  let resources: Resources | undefined;
  let found = 0;
  page.plugin({
    name: "reader",
    inject: { required: ["resources"] },
    apply(ctx) {
      resources = ctx.resources;
      ctx.on("resources/found", () => found++);
    },
  });
  await Promise.all([host.settled(), page.settled()]);
  return {
    vault,
    load: (target: string) => resources!.load(target, NOTE, "wikilink"),
    found: () => found,
    async dispose() {
      await page.dispose();
      await host.dispose();
      await pair.dispose();
    },
  };
}

/** Until the host's notices (sent at the end of a task) reach the page. */
function delivered(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

test("a page hears when a file it could not load is created", async () => {
  const page = await notePage();
  await assert.rejects(page.load("Sketch.sketch.svg"), /not found/);

  page.vault.upsertFile(file("Other.png"));
  await delivered();
  assert.equal(page.found(), 0, "not for a file the page never asked for");

  page.vault.upsertFile(file("Attachments/Sketch.sketch.svg"));
  await delivered();
  assert.equal(page.found(), 1);
  assert.equal(
    (await page.load("Sketch.sketch.svg")).url,
    `${ROOT}/Attachments/Sketch.sketch.svg?v=7`,
  );

  page.vault.upsertFile(file("Later.png"));
  await delivered();
  assert.equal(page.found(), 1, "a found link is forgotten");
  await page.dispose();
});

test("a page hears when its missing file is renamed into place, or indexed late", async () => {
  const page = await notePage();
  await assert.rejects(page.load("Photo.png"));
  await assert.rejects(page.load("Synced.png"));
  page.vault.upsertFile(file("Photo.png.part"));
  await delivered();
  assert.equal(page.found(), 0);

  page.vault.renameFile("Photo.png.part", file("Photo.png"));
  await delivered();
  assert.equal(page.found(), 1);

  // Catching up after start-up adds files without events, then resolves.
  page.vault.addFiles([file("Synced.png")]);
  page.vault.notifyResolved();
  await delivered();
  assert.equal(page.found(), 2);
  await page.dispose();
});
