/**
 * Lightweight in-memory `localStorage` and `indexedDB` shims for headless Node
 * environments where browser storage globals are not available (used by
 * plugins like Dataview's `localforage`-backed `LocalStorageCache`).
 */
export function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string): string | null {
      return map.get(key) ?? null;
    },
    key(index: number): string | null {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    setItem(key: string, value: string): void {
      map.set(key, String(value));
    },
  };
}

interface IdbReq<T = unknown> {
  result: T;
  error: Error | null;
  onsuccess: ((ev: { target: IdbReq<T> }) => void) | null;
  onerror: ((ev: { target: IdbReq<T> }) => void) | null;
  onupgradeneeded?: ((ev: { target: IdbReq<T> }) => void) | null;
}

function makeIdbReq<T>(compute: () => T): IdbReq<T> {
  const req: IdbReq<T> = {
    result: undefined as unknown as T,
    error: null,
    onsuccess: null,
    onerror: null,
  };
  queueMicrotask(() => {
    try {
      req.result = compute();
      req.onsuccess?.({ target: req });
    } catch (err) {
      req.error = err instanceof Error ? err : new Error(String(err));
      req.onerror?.({ target: req });
    }
  });
  return req;
}

function createObjectStore(store: Map<string, unknown>) {
  return {
    get: (k: string) => makeIdbReq(() => store.get(String(k))),
    put: (v: unknown, k?: string) =>
      makeIdbReq(() => {
        const key = String(
          k ?? (v && typeof v === "object" ? (v as { id?: string }).id : ""),
        );
        store.set(key, v);
        return key;
      }),
    add: (v: unknown, k?: string) =>
      makeIdbReq(() => {
        const key = String(k ?? "");
        store.set(key, v);
        return key;
      }),
    delete: (k: string) =>
      makeIdbReq(() => {
        store.delete(String(k));
      }),
    clear: () =>
      makeIdbReq(() => {
        store.clear();
      }),
    getAllKeys: () => makeIdbReq(() => [...store.keys()]),
    getAll: () => makeIdbReq(() => [...store.values()]),
    count: () => makeIdbReq(() => store.size),
    openKeyCursor: () => makeIdbReq(() => null),
    openCursor: () => makeIdbReq(() => null),
    createIndex: () => ({}),
  };
}

function createIdbDatabase(
  name: string,
  version: number,
  stores: Map<string, Map<string, unknown>>,
) {
  const getStore = (storeName: string) => {
    let s = stores.get(storeName);
    if (!s) {
      s = new Map();
      stores.set(storeName, s);
    }
    return s;
  };
  const objectStoreNames = {
    contains: (n: string) => stores.has(n),
    get length() {
      return stores.size;
    },
    item: (i: number) => [...stores.keys()][i] ?? null,
    [Symbol.iterator]: function* () {
      yield* stores.keys();
    },
  };
  return {
    name,
    version,
    objectStoreNames,
    createObjectStore: (n: string) => createObjectStore(getStore(n)),
    deleteObjectStore: (n: string) => {
      stores.delete(n);
    },
    transaction: () => {
      const tx = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        error: null,
        objectStore: (n: string) => createObjectStore(getStore(n)),
      };
      setTimeout(() => tx.oncomplete?.(), 0);
      return tx;
    },
    close: () => {},
  };
}

export function installStorageShims(
  targetGlobal: Record<PropertyKey, unknown>,
): void {
  if (!targetGlobal.localStorage) {
    targetGlobal.localStorage = createMemoryStorage();
  }
  if (!targetGlobal.sessionStorage) {
    targetGlobal.sessionStorage = createMemoryStorage();
  }
  if (!targetGlobal.indexedDB) {
    const dbStores = new Map<string, Map<string, Map<string, unknown>>>();
    targetGlobal.indexedDB = {
      open: (name: string, version = 1) => {
        let stores = dbStores.get(name);
        const isNew = !stores;
        if (!stores) {
          stores = new Map();
          dbStores.set(name, stores);
        }
        const db = createIdbDatabase(name, version, stores);
        const req: IdbReq<typeof db> = {
          result: db,
          error: null,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
        };
        queueMicrotask(() => {
          if (isNew) {
            req.onupgradeneeded?.({ target: req });
          }
          req.onsuccess?.({ target: req });
        });
        return req;
      },
      deleteDatabase: (name: string) =>
        makeIdbReq(() => {
          dbStores.delete(name);
        }),
    };
  }
  if (!targetGlobal.IDBKeyRange) {
    targetGlobal.IDBKeyRange = {
      bound: (lower: unknown, upper: unknown) => ({ lower, upper }),
      only: (value: unknown) => ({ lower: value, upper: value }),
      lowerBound: (lower: unknown) => ({ lower }),
      upperBound: (upper: unknown) => ({ upper }),
    };
  }
}

export function installObserverAndStyleShims(
  targetGlobal: Record<PropertyKey, unknown>,
): void {
  if (!targetGlobal.IntersectionObserver) {
    targetGlobal.IntersectionObserver = class IntersectionObserver {
      constructor(private readonly cb: (entries: unknown[]) => void) {}
      observe(target: unknown): void {
        queueMicrotask(() => {
          this.cb([{ isIntersecting: true, target }]);
        });
      }
      unobserve(): void {}
      disconnect(): void {}
    };
  }
  if (!targetGlobal.ResizeObserver) {
    targetGlobal.ResizeObserver = class ResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
  if (!targetGlobal.MutationObserver) {
    targetGlobal.MutationObserver = class MutationObserver {
      observe(): void {}
      disconnect(): void {}
      takeRecords(): unknown[] {
        return [];
      }
    };
  }
  if (!targetGlobal.CSSStyleSheet) {
    targetGlobal.CSSStyleSheet = class CSSStyleSheet {
      cssRules: unknown[] = [];
      replaceSync(): void {}
      replace(): Promise<this> {
        return Promise.resolve(this);
      }
      insertRule(): number {
        return 0;
      }
      deleteRule(): void {}
    };
  }
}
