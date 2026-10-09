/**
 * A service fake for leave-no-trace tests: any property is another fake,
 * any call returns a handle, and a handle returned by a registration
 * (`onX`, `command`, `register…`, `treeView`, `statusBar`, `watch…`,
 * `create…`, `handle`, `subscribe`, `listen`) counts as outstanding until it
 * is called (a disposer) or disposed. A plugin that stopped cleanly leaves
 * none outstanding. `overrides` replace members by path, such as
 * `"editors.active"`.
 */
const REGISTRATION =
  /^(on[A-Z]|command$|register|tree$|status$|treeView|statusBar|watch|create|handle$|subscribe|listen)/;

export interface Tracker {
  /** Registrations not undone yet, by method path. */
  outstanding(): string[];
}

export function trackingFake<T>(
  name: string,
  overrides: Record<string, unknown> = {},
): { fake: T; tracker: Tracker } {
  const live = new Map<object, string>();
  const make = (path: string, registration: boolean): unknown => {
    const children = new Map<PropertyKey, unknown>();
    const target = function () {};
    const handle: object = new Proxy(target, {
      get(_target, key) {
        if (key === "then") {
          return undefined;
        }
        if (key === Symbol.iterator) {
          return function* () {};
        }
        if (key === Symbol.toPrimitive) {
          return () => "";
        }
        if (key === "dispose") {
          return () => {
            live.delete(handle);
          };
        }
        const child = `${path}.${String(key)}`;
        if (child in overrides) {
          return overrides[child];
        }
        if (!children.has(key)) {
          children.set(key, make(`${path}.${String(key)}`, false));
        }
        return children.get(key);
      },
      apply() {
        if (registration) {
          live.delete(handle);
          return undefined;
        }
        const method = path.split(".").at(-1) ?? "";
        const result = make(`${path}()`, REGISTRATION.test(method));
        if (REGISTRATION.test(method)) {
          live.set(result as object, path);
        }
        return result;
      },
    });
    return handle;
  };
  return {
    fake: make(name, false) as T,
    tracker: { outstanding: () => [...live.values()].sort() },
  };
}
