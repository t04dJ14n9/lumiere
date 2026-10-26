/**
 * Lumière on the iPad: host-web runs the plugins in the app's web view, over
 * the iPad's own files (the app's folder, "Lumière" in Files, and folders
 * picked in Files), through the native plugin; the window is the desktop
 * app's. index.html loads this module.
 */
import { startLocalHost } from "@workshop/app/local";
import { startWindow } from "@workshop/app/shell";
import { parseMenus } from "@workshop/host-node/core";
import { indexedDbFolder, MemoryFileSystem, Mounts } from "@workshop/host-web";
import type { ContributedSetting } from "@workshop/markdown/portable";
import { NativeFileSystem } from "./native-fs";
import { vaultFileUrl } from "./resources";
import { vaultFiles, type NativeVault } from "./native/vault-files";
import { appCommands } from "./native/window-commands";
import { WELCOME } from "./welcome";

const DATA = "/lumiere-data";

async function main(): Promise<void> {
  const base = new URL(".", location.href);
  const files = new Mounts();
  files.mount(
    DATA,
    await indexedDbFolder("data").catch(() => new MemoryFileSystem()),
  );
  const { vaults } = await vaultFiles.vaults();
  const paths = new Map<string, string>();
  for (const vault of vaults) {
    paths.set(vault.id, mountVault(files, vault, paths));
  }
  const appFolder = paths.get("app")!;
  await welcome(files, appFolder);
  const [contributed, menus] = await Promise.all([
    json<ContributedSetting[]>(new URL("contributed.json", base)),
    json<unknown>(new URL("menus.json", base)),
  ]);
  const local = await startLocalHost({
    files,
    dataRoot: DATA,
    workerUrl: (name) => new URL(`workers/${name}.web.js`, base).href,
    contributed,
    menus: parseMenus(menus),
    pages: {
      origin: location.origin,
      editor: new URL("markdown/", base).href,
      shim: new URL("page/shim.js", base).href,
      pdf: {
        viewer: new URL("pdf/", base).href,
        shim: new URL("page/pdf-shim.js", base).href,
      },
      // Answered by the app's router (VaultRouter.swift); only vault files.
      resource: (_panel, uri) =>
        vaultFileUrl(uri, paths, base) ??
        new URL("_lumiere/missing", base).href,
    },
    pickFolder: async () => {
      const { vault } = await vaultFiles.pickFolder();
      if (!vault) {
        return undefined;
      }
      const path = paths.get(vault.id) ?? mountVault(files, vault, paths);
      paths.set(vault.id, path);
      return path;
    },
  });
  startWindow(document.getElementById("root")!, {
    ...local.backend,
    appCommands,
  });
  const [last] = (await local.backend.vaults.list()).recent;
  await local.backend.vaults
    .add(last ?? appFolder)
    .catch(() => local.backend.vaults.add(appFolder));
}

/** Mount a vault at `/vaults/<its name>`, kept apart from any other of that name. */
function mountVault(
  files: Mounts,
  vault: NativeVault,
  taken: ReadonlyMap<string, string>,
): string {
  const name = vault.name.replace(/[/\\]/g, "-") || "Folder";
  const used = new Set(taken.values());
  let path = `/vaults/${name}`;
  for (let n = 2; used.has(path); n++) {
    path = `/vaults/${name} ${n}`;
  }
  files.mount(path, new NativeFileSystem(vault.id));
  return path;
}

/** The app's folder starts with a note, so the first launch shows something. */
async function welcome(files: Mounts, folder: string): Promise<void> {
  const root = files.uriOf(folder);
  if ((await files.list(root))?.some((entry) => !entry.name.startsWith("."))) {
    return;
  }
  const note = files.uriOf(`${folder}/Welcome.md`);
  await files.create(note);
  await files.save(note, WELCOME);
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
