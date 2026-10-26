/**
 * Lumière in a browser, with no server (apps/web): host-web runs the plugins
 * in this window, over the browser's own storage and folders the reader
 * picks; the window is the desktop app's. index.html loads this module.
 */
import { startLocalHost } from "@workshop/app/local";
import { startWindow } from "@workshop/app/shell";
import { parseMenus } from "@workshop/host-node/core";
import { webInk } from "@workshop/ink/canvas";
import {
  indexedDbFolder,
  MemoryFileSystem,
  Mounts,
  type VaultFileSystem,
} from "@workshop/host-web";
import type { ContributedSetting } from "@workshop/markdown/portable";
import { answerWorker, windowAnswers } from "./answers";
import { DEMO } from "./demo";
import {
  canPickFolders,
  mountRemembered,
  pickFolder,
  privateFolder,
} from "./folders";
import { HandleFileSystem } from "./handle-fs";
import { NotePages } from "./note-pages";
import { fileUrl } from "./shared/routes";

const DATA = "/lumiere-data";
const DEMO_VAULT = "/vaults/Lumière Demo";
/** The sketch plugin's command (packages/markdown/src/plugins/sketch). */
const INSERT_SKETCH_COMMAND = "lumiere.markdown.insertSketch";

async function main(): Promise<void> {
  const base = new URL(".", location.href);
  const files = new Mounts();
  files.mount(DATA, await kept("data"));
  files.mount(DEMO_VAULT, await demoVault());
  await mountRemembered(files);
  const [contributed, menus] = await Promise.all([
    json<ContributedSetting[]>(new URL("contributed.json", base)),
    json<unknown>(new URL("menus.json", base)),
  ]);
  const notePages = new NotePages({
    base: base.href,
    policy: windowPolicy(),
    isServed: () => Boolean(navigator.serviceWorker?.controller),
  });
  const local = await startLocalHost({
    files,
    dataRoot: DATA,
    workerUrl: (name) => new URL(`workers/${name}.web.js`, base).href,
    contributed,
    menus: parseMenus(menus),
    // Sketches are drawn on the web canvas, over this window.
    ink: webInk(),
    pages: {
      origin: location.origin,
      editor: new URL("markdown/", base).href,
      shim: new URL("page/shim.js", base).href,
      pdf: {
        viewer: new URL("pdf/", base).href,
        shim: new URL("page/pdf-shim.js", base).href,
      },
      // Answered by the service worker, which asks this window for them.
      resource: (panel, uri) => fileUrl(base.href, panel, uri),
      servePage: (html) => notePages.serve(html),
    },
    ...(canPickFolders() ? { pickFolder: () => pickFolder(files) } : {}),
  });
  if (navigator.serviceWorker) {
    answerWorker({
      messages: navigator.serviceWorker,
      worker: new URL("sw.js", base).href,
      answer: windowAnswers({
        pages: notePages,
        files: {
          panels: local.host.panels,
          vaults: () => local.vaults.list().open,
          files,
        },
      }),
    });
  }
  startWindow(document.getElementById("root")!, {
    ...local.backend,
    insertSketch: () => local.host.run(INSERT_SKETCH_COMMAND),
  });
  // The last vault opened again; on a first visit, the demo vault.
  const [last] = (await local.backend.vaults.list()).recent;
  await local.backend.vaults
    .add(last ?? DEMO_VAULT)
    .catch(() => local.backend.vaults.add(DEMO_VAULT));
  await navigator.serviceWorker
    ?.register(new URL("sw.js", base))
    .catch(() => {});
}

/** The window's content security policy, which a note's page keeps. */
function windowPolicy(): string {
  return (
    document.querySelector<HTMLMetaElement>(
      'meta[http-equiv="Content-Security-Policy"]',
    )?.content ?? ""
  );
}

/**
 * A folder in the browser's private storage where a page can write it
 * (Chromium), else in IndexedDB (Safari), else in memory for this visit.
 */
async function kept(name: string): Promise<VaultFileSystem> {
  const folder = await privateFolder(name);
  if (folder && (await canWrite(folder))) {
    return new HandleFileSystem(folder);
  }
  return indexedDbFolder(name).catch(() => new MemoryFileSystem());
}

/** Whether this browser lets a page write files in its private storage. */
async function canWrite(folder: FileSystemDirectoryHandle): Promise<boolean> {
  const probe = ".lumiere-probe";
  try {
    const file = await folder.getFileHandle(probe, { create: true });
    const writable = await file.createWritable();
    await writable.write("ok");
    await writable.close();
    await folder.removeEntry(probe);
    return true;
  } catch {
    return false;
  }
}

/** The demo vault, written into the browser's storage on the first visit. */
async function demoVault(): Promise<VaultFileSystem> {
  const vault = await kept("demo");
  if ((await vault.list(""))?.length === 0) {
    for (const [path, text] of Object.entries(DEMO)) {
      if (path.includes("/")) {
        await vault.mkdir(path.slice(0, path.lastIndexOf("/")));
      }
      await vault.write(path, new TextEncoder().encode(text), "create");
    }
  }
  return vault;
}

async function json<T>(url: URL): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url.pathname} (${response.status})`);
  }
  return (await response.json()) as T;
}

void main().catch((error: unknown) => {
  document.body.textContent = `Lumière could not start: ${
    error instanceof Error ? error.message : String(error)
  }`;
});
