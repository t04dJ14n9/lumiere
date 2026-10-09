import type { PanelPort } from "../../shared/runtime";
import type { HostDocument } from "../../shared/runtime";
import type { ApiPlatform } from "./platform";
import type { DocumentState, EditorSnapshot } from "./types";
export function documentSnapshot(
  document: HostDocument,
  platform: ApiPlatform,
): DocumentState {
  return Object.freeze({
    documentId: document.id,
    uri: platform.uri(document.uri),
    version: document.version,
    isDirty: document.isDirty,
    isUntitled: document.isUntitled,
  });
}
export function editorSnapshot(
  panel: PanelPort,
  platform: ApiPlatform,
): EditorSnapshot {
  return Object.freeze({
    ...documentSnapshot(panel.document, platform),
    editorId: panel.id,
    viewColumn: panel.column,
    isActive: panel.active(),
  });
}
/** Clone index objects before freezing; consumers cannot mutate the live index. */
export function immutable<T>(
  value: T,
  seen = new WeakMap<object, unknown>(),
): T {
  if (!value || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value) as T;
  }
  if (value instanceof Map) {
    return immutableMap(value, seen) as T;
  }
  const copy: unknown[] | Record<string, unknown> = Array.isArray(value)
    ? []
    : {};
  seen.set(value, copy);
  for (const [key, item] of Object.entries(value)) {
    Object.defineProperty(copy, key, {
      value: immutable(item, seen),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return Object.freeze(copy) as T;
}
function immutableMap(
  value: Map<unknown, unknown>,
  seen: WeakMap<object, unknown>,
): ReadonlyMap<unknown, unknown> {
  const copy = new Map<unknown, unknown>();
  const facade: ReadonlyMap<unknown, unknown> = Object.freeze({
    get size() {
      return copy.size;
    },
    get: (key: unknown) => copy.get(key),
    has: (key: unknown) => copy.has(key),
    entries: () => copy.entries(),
    keys: () => copy.keys(),
    values: () => copy.values(),
    [Symbol.iterator]: () => copy[Symbol.iterator](),
    forEach(
      callback: (
        value: unknown,
        key: unknown,
        map: ReadonlyMap<unknown, unknown>,
      ) => void,
      thisArg?: unknown,
    ) {
      copy.forEach((item, key) => callback.call(thisArg, item, key, facade));
    },
  });
  seen.set(value, facade);
  for (const [key, item] of value) {
    copy.set(immutable(key, seen), immutable(item, seen));
  }
  return facade;
}
