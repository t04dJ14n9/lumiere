/**
 * A folder kept in IndexedDB, for browsers that cannot write their own
 * private storage from a page (Safari). Its files are held in memory
 * (host-web's MemoryFileSystem) and every change is written through.
 */
import { MemoryFileSystem, type MemoryEntry } from "@workshop/host-web";

const DATABASE = "lumiere-files";
const ENTRIES = "entries";
/** Between a folder's name and a path in a key: no path holds it. */
const SEPARATOR = "\u0000";

export async function indexedDbFolder(name: string): Promise<MemoryFileSystem> {
  const db = await open();
  const entries = await load(db, name);
  return new MemoryFileSystem(entries, (path, entry) => {
    const store = db.transaction(ENTRIES, "readwrite").objectStore(ENTRIES);
    const key = `${name}${SEPARATOR}${path}`;
    const request = entry ? store.put(entry, key) : store.delete(key);
    request.onerror = () =>
      console.error(`Lumière could not keep ${path}`, request.error);
  });
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(ENTRIES);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function load(
  db: IDBDatabase,
  name: string,
): Promise<Map<string, MemoryEntry>> {
  const range = IDBKeyRange.bound(
    `${name}${SEPARATOR}`,
    `${name}${SEPARATOR}￿`,
  );
  return new Promise((resolve, reject) => {
    const entries = new Map<string, MemoryEntry>();
    const cursor = db
      .transaction(ENTRIES)
      .objectStore(ENTRIES)
      .openCursor(range);
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) {
        resolve(entries);
        return;
      }
      const path = String(current.key).slice(name.length + 1);
      entries.set(path, current.value as MemoryEntry);
      current.continue();
    };
    cursor.onerror = () => reject(cursor.error);
  });
}
