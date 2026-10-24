import { parse as yamlParse, stringify as yamlStringify } from "yaml";

export interface EventRef {
  e: Events;
  name: string;
  fn: (...data: unknown[]) => unknown;
  ctx: unknown;
}

export class Events {
  private readonly _listeners = new Map<string, EventRef[]>();

  on(
    name: string,
    callback: (...data: never[]) => unknown,
    ctx?: unknown,
  ): EventRef {
    let list = this._listeners.get(name);
    if (!list) {
      list = [];
      this._listeners.set(name, list);
    }
    const ref: EventRef = {
      e: this,
      name,
      fn: callback as (...data: unknown[]) => unknown,
      ctx,
    };
    list.push(ref);
    return ref;
  }

  off(name: string, callback: (...data: never[]) => unknown): void {
    const list = this._listeners.get(name);
    if (list) {
      this._listeners.set(
        name,
        list.filter((item) => item.fn !== callback),
      );
    }
  }

  offref(ref: EventRef): void {
    const list = ref ? this._listeners.get(ref.name) : undefined;
    if (list) {
      this._listeners.set(
        ref.name,
        list.filter((item) => item !== ref),
      );
    }
  }

  trigger(name: string, ...data: unknown[]): void {
    const list = this._listeners.get(name);
    if (!list || list.length === 0) {
      return;
    }
    for (const ref of [...list]) {
      this.tryTrigger(ref, data);
    }
  }

  tryTrigger(evt: EventRef, args: unknown[]): void {
    try {
      evt.fn.apply(evt.ctx, args);
    } catch (error) {
      console.error(error);
    }
  }
}

export interface KeymapEventHandler {
  modifiers: string | null;
  key: string | null;
  func: (evt: KeyboardEvent, ctx?: unknown) => boolean | void;
  scope?: Scope;
}

export class Scope {
  keys: KeymapEventHandler[] = [];
  parent: Scope | undefined;

  constructor(parent?: Scope) {
    this.parent = parent;
  }

  register(
    modifiers: string[] | null,
    key: string | null,
    func: (evt: KeyboardEvent, ctx?: unknown) => boolean | void,
  ): KeymapEventHandler {
    const handler: KeymapEventHandler = {
      modifiers: modifiers ? modifiers.join(",") : null,
      key: key ? key.toLowerCase() : null,
      func,
      scope: this,
    };
    this.keys.push(handler);
    return handler;
  }

  unregister(handler: KeymapEventHandler): void {
    const idx = this.keys.indexOf(handler);
    if (idx >= 0) {
      this.keys.splice(idx, 1);
    }
  }
}

export class Keymap {
  private readonly scopes: Scope[] = [];

  pushScope(scope: Scope): void {
    this.scopes.push(scope);
  }

  popScope(scope: Scope): void {
    const idx = this.scopes.lastIndexOf(scope);
    if (idx >= 0) {
      this.scopes.splice(idx, 1);
    }
  }

  static isModifier(
    evt: MouseEvent | KeyboardEvent,
    modifier: string,
  ): boolean {
    if (modifier === "Mod" || modifier === "Ctrl") {
      return Boolean(evt.ctrlKey || evt.metaKey);
    }
    if (modifier === "Meta") {
      return Boolean(evt.metaKey);
    }
    if (modifier === "Shift") {
      return Boolean(evt.shiftKey);
    }
    if (modifier === "Alt") {
      return Boolean(evt.altKey);
    }
    return false;
  }
}

export class Component {
  _loaded = false;
  private readonly _events: Array<() => void> = [];
  private readonly _children: Component[] = [];

  load(): void | Promise<void> {
    if (this._loaded) {
      return;
    }
    this._loaded = true;
    const result = this.onload();
    for (const child of [...this._children]) {
      void child.load();
    }
    return result;
  }

  onload(): void | Promise<void> {}

  unload(): void {
    if (
      !this._loaded &&
      this._children.length === 0 &&
      this._events.length === 0
    ) {
      return;
    }
    this._loaded = false;
    while (this._children.length > 0) {
      this._children.pop()?.unload();
    }
    while (this._events.length > 0) {
      const dispose = this._events.pop();
      try {
        dispose?.();
      } catch (error) {
        console.error(error);
      }
    }
    this.onunload();
  }

  onunload(): void {}

  addChild<T extends Component>(component: T): T {
    if (!this._children.includes(component)) {
      this._children.push(component);
    }
    if (this._loaded) {
      void component.load();
    }
    return component;
  }

  removeChild<T extends Component>(component: T): T {
    const index = this._children.indexOf(component);
    if (index >= 0) {
      this._children.splice(index, 1);
      component.unload();
    }
    return component;
  }

  register(cb: () => unknown): void {
    if (typeof cb === "function") {
      this._events.push(() => {
        cb();
      });
    }
  }

  registerEvent(eventRef: EventRef | (() => void) | undefined): void {
    if (!eventRef) {
      return;
    }
    if (typeof eventRef === "function") {
      this.register(eventRef);
    } else if (eventRef.e && typeof eventRef.e.offref === "function") {
      this.register(() => eventRef.e.offref(eventRef));
    }
  }

  registerDomEvent(
    el: EventTarget,
    type: string,
    callback: (ev: never) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (!el || typeof el.addEventListener !== "function") {
      return;
    }
    const listener = (ev: Event) => {
      callback.call(el, ev as never);
    };
    el.addEventListener(type, listener, options);
    this.register(() => el.removeEventListener(type, listener, options));
  }

  registerScopeEvent(keyHandler: KeymapEventHandler): KeymapEventHandler {
    if (keyHandler?.scope) {
      const scope = keyHandler.scope;
      this.register(() => scope.unregister(keyHandler));
    }
    return keyHandler;
  }

  registerInterval(id: number): number {
    this.register(() => clearInterval(id));
    return id;
  }
}

export class MarkdownRenderChild extends Component {
  containerEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    super();
    this.containerEl = containerEl;
  }

  override onunload(): void {
    if (
      this.containerEl &&
      typeof (this.containerEl as { detach?: () => void }).detach === "function"
    ) {
      this.containerEl.detach();
    } else {
      this.containerEl?.parentNode?.removeChild(this.containerEl);
    }
  }
}

const navPlatform =
  typeof navigator !== "undefined" ? (navigator.platform ?? "") : "";
const isMac = /Mac|iPod|iPhone|iPad/i.test(navPlatform);
const isWindows = /Win/i.test(navPlatform);

export const Platform = Object.freeze({
  isDesktop: true,
  isDesktopApp: true,
  isMobile: false,
  isMobileApp: false,
  isIosApp: false,
  isAndroidApp: false,
  isPhone: false,
  isTablet: false,
  isMacOS: isMac,
  isWin: isWindows,
  isLinux: !isMac && !isWindows,
  isSafari: false,
  resourcePathPrefix: "app://local/",
});

export const apiVersion = "1.7.7";

export function requireApiVersion(version: string): boolean {
  const parseParts = (v: string) =>
    v.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const current = parseParts(apiVersion);
  const target = parseParts(String(version ?? ""));
  const len = Math.max(current.length, target.length);
  for (let i = 0; i < len; i++) {
    const a = current[i] ?? 0;
    const b = target[i] ?? 0;
    if (a !== b) {
      return a > b;
    }
  }
  return true;
}

export interface Debouncer<T extends unknown[], V> {
  (...args: T): Debouncer<T, V>;
  cancel(): Debouncer<T, V>;
  run(): V | undefined;
}

export function debounce<T extends unknown[], V>(
  cb: (...args: T) => V,
  timeout = 0,
  resetTimer = false,
): Debouncer<T, V> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latestArgs: T | null = null;

  const fire = (): V | undefined => {
    if (!latestArgs) {
      return undefined;
    }
    const args = latestArgs;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    latestArgs = null;
    return cb(...args);
  };

  const fn = ((...args: T): Debouncer<T, V> => {
    latestArgs = args;
    if (timer !== null && resetTimer) {
      clearTimeout(timer);
      timer = null;
    }
    if (timer === null) {
      timer = setTimeout(() => {
        fire();
      }, timeout);
    }
    return fn;
  }) as Debouncer<T, V>;

  fn.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    latestArgs = null;
    return fn;
  };
  fn.run = () => fire();
  return fn;
}

export function normalizePath(path: string): string {
  const replaced = String(path ?? "")
    .replace(/[\\]+/g, "/")
    .replace(/\/+/g, "/");
  return replaced === "/" ? "/" : replaced.replace(/^\/+|\/+$/g, "");
}

export function parseYaml(yaml: string): unknown {
  return yamlParse(String(yaml ?? ""));
}

export function stringifyYaml(obj: unknown): string {
  return yamlStringify(obj);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function arrayBufferToHex(data: ArrayBuffer): string {
  return Array.from(new Uint8Array(data))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToArrayBuffer(hex: string): ArrayBuffer {
  const clean = hex.trim();
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  return bytes.buffer;
}

export function moment(input?: Date | number | string) {
  const date = input === undefined ? new Date() : new Date(input);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return {
    format(pattern = "YYYY-MM-DDTHH:mm:ssZ"): string {
      return pattern
        .replace(/YYYY/g, String(date.getFullYear()))
        .replace(/YY/g, String(date.getFullYear()).slice(-2))
        .replace(/MM/g, pad(date.getMonth() + 1))
        .replace(/DD/g, pad(date.getDate()))
        .replace(/HH/g, pad(date.getHours()))
        .replace(/mm/g, pad(date.getMinutes()))
        .replace(/ss/g, pad(date.getSeconds()));
    },
    valueOf: () => date.getTime(),
    unix: () => Math.floor(date.getTime() / 1000),
    toDate: () => new Date(date.getTime()),
    toISOString: () => date.toISOString(),
    isValid: () => !Number.isNaN(date.getTime()),
    clone: () => moment(date.getTime()),
  };
}
moment.locale = () => "en";
moment.unix = (seconds: number) => moment(seconds * 1000);
moment.utc = (input?: Date | number | string) => moment(input);
