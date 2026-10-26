/**
 * Vaults the reader keeps in the browser: folders picked with the File
 * System Access API (Chromium), remembered between visits in IndexedDB, and
 * vaults kept in the browser's private storage (every browser). Each is
 * mounted in host-web at `/vaults/<name>`.
 */
import type { Mounts } from "@workshop/host-web";
import { HandleFileSystem } from "./handle-fs";

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
      id?: string;
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

const DATABASE = "lumiere";
const FOLDERS = "folders";

/** Whether the reader can pick a folder of their own (not in Safari or Firefox). */
export function canPickFolders(): boolean {
  return typeof window.showDirectoryPicker === "function";
}

/** Let the reader pick a folder, mount it, remember it; its vault path. */
export async function pickFolder(files: Mounts): Promise<string | undefined> {
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await window.showDirectoryPicker!({
      mode: "readwrite",
      id: "lumiere",
    });
  } catch {
    return undefined; // The reader cancelled.
  }
  const path = await mountFolder(files, handle);
  await remember(handle);
  return path;
}

/** Mount the folders picked on earlier visits that the browser still lets us read. */
export async function mountRemembered(files: Mounts): Promise<void> {
  for (const handle of await remembered()) {
    const permission = await handle
      .queryPermission?.({ mode: "readwrite" })
      .catch(() => "denied");
    if (permission === "granted") {
      await mountFolder(files, handle);
    }
  }
}

async function mountFolder(
  files: Mounts,
  handle: FileSystemDirectoryHandle,
): Promise<string> {
  const path = `/vaults/${safeName(handle.name)}`;
  files.mount(path, new HandleFileSystem(handle));
  return path;
}

/** The browser's private storage, or undefined where it has none. */
export async function privateFolder(
  name: string,
): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(name, { create: true });
  } catch {
    return undefined;
  }
}

function safeName(name: string): string {
  return name.replace(/[/\\]/g, "-") || "Folder";
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(FOLDERS);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function remember(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const put = db
      .transaction(FOLDERS, "readwrite")
      .objectStore(FOLDERS)
      .put(handle, handle.name);
    put.onsuccess = () => resolve();
    put.onerror = () => reject(put.error);
  });
}

async function remembered(): Promise<FileSystemDirectoryHandle[]> {
  try {
    const db = await database();
    return await new Promise((resolve, reject) => {
      const all = db.transaction(FOLDERS).objectStore(FOLDERS).getAll();
      all.onsuccess = () => resolve(all.result as FileSystemDirectoryHandle[]);
      all.onerror = () => reject(all.error);
    });
  } catch {
    return [];
  }
}

declare global {
  interface FileSystemHandle {
    queryPermission?(descriptor: {
      mode: "read" | "readwrite";
    }): Promise<PermissionState>;
  }
}
