import { getDomDocument } from "./dom-helpers";
import { moment } from "./obsidian-moment";
import {
  installObserverAndStyleShims,
  installStorageShims,
} from "./runtime-storage";

const blobSourceMap = new Map<string, string>();
let blobCounter = 0;

function defineProtoIfMissing(
  proto: object,
  name: string,
  fn: (...args: never[]) => unknown,
): void {
  if (name in proto) {
    return;
  }
  Object.defineProperty(proto, name, {
    value: fn,
    configurable: true,
    writable: true,
  });
}

function buildStdlibProtoMethods(
  asStr: (ctx: unknown) => string,
  asArr: (ctx: unknown) => unknown[],
) {
  return {
    str: {
      contains(target: string, pos?: number) {
        return asStr(this).includes(target, pos);
      },
      format(...args: string[]) {
        return asStr(this).replace(/\{(\d+)\}/g, (m, idx: string) => {
          const val = args[Number(idx)];
          return val !== undefined ? String(val) : m;
        });
      },
    },
    arr: {
      contains(target: unknown) {
        return asArr(this).includes(target);
      },
      remove(target: unknown) {
        const arr = asArr(this);
        const idx = arr.indexOf(target);
        if (idx >= 0) {
          arr.splice(idx, 1);
        }
      },
      first() {
        return asArr(this)[0];
      },
      last() {
        const arr = asArr(this);
        return arr[arr.length - 1];
      },
      unique() {
        return [...new Set(asArr(this))];
      },
    },
  };
}

function installObsidianNativePrototypes(): void {
  const methods = buildStdlibProtoMethods(
    (ctx) => String(ctx),
    (ctx) => ctx as unknown[],
  );
  for (const [k, fn] of Object.entries(methods.str)) {
    defineProtoIfMissing(
      String.prototype,
      k,
      fn as (...args: never[]) => unknown,
    );
  }
  for (const [k, fn] of Object.entries(methods.arr)) {
    defineProtoIfMissing(
      Array.prototype,
      k,
      fn as (...args: never[]) => unknown,
    );
  }
  const mathObj = Math as unknown as Record<string, unknown>;
  if (typeof mathObj.clamp !== "function") {
    mathObj.clamp = (val: number, min: number, max: number) =>
      Math.min(Math.max(val, min), max);
  }
  const numObj = Number as unknown as Record<string, unknown>;
  if (typeof numObj.isNumber !== "function") {
    numObj.isNumber = (val: unknown): val is number =>
      typeof val === "number" && !Number.isNaN(val);
  }
}

function runWorkerCode(
  code: string,
  workerScope: Record<string, unknown>,
): void {
  const fName = "__" + "filename";
  const dName = "__" + "dirname";
  const globals = globalThis as Record<string, unknown>;
  const prevOnMessage = globals.onmessage;
  globals.onmessage = null;
  const postMsg = (data: unknown) =>
    (workerScope.postMessage as (d: unknown) => void)(data);
  const captureGlobalOnMessage = () => {
    if (!workerScope.onmessage && typeof globals.onmessage === "function") {
      workerScope.onmessage = globals.onmessage;
    }
    globals.onmessage = prevOnMessage ?? null;
  };
  try {
    const fn = new Function(
      "self",
      "window",
      "globalThis",
      "postMessage",
      "require",
      "module",
      "exports",
      fName,
      dName,
      `let onmessage = null;\n${code}\n;if (typeof onmessage === "function") { self.onmessage = onmessage; }`,
    );
    fn(
      workerScope,
      workerScope,
      workerScope,
      postMsg,
      globals.require,
      { exports: {} },
      {},
      "worker.js",
      ".",
    );
    captureGlobalOnMessage();
    return;
  } catch (err) {
    captureGlobalOnMessage();
    if (!(err instanceof EvalError)) {
      throw err;
    }
  }
  runNoncedWorkerScript(code, workerScope, postMsg, captureGlobalOnMessage);
}

function runNoncedWorkerScript(
  code: string,
  workerScope: Record<string, unknown>,
  postMsg: (data: unknown) => void,
  captureGlobalOnMessage: () => void,
): void {
  const fName = "__" + "filename";
  const dName = "__" + "dirname";
  const doc = getDomDocument();
  const globals = globalThis as Record<string, unknown>;
  globals.onmessage = null;
  const slot = `__lumiereWorkerExec_${++blobCounter}`;
  globals[slot] = (
    factory: ((...args: unknown[]) => unknown) | null,
    thrown?: unknown,
  ) => {
    if (!factory || thrown !== undefined) {
      return;
    }
    factory(
      workerScope,
      workerScope,
      workerScope,
      postMsg,
      globals.require,
      { exports: {} },
      {},
      "worker.js",
      ".",
    );
  };
  const existing = doc.querySelector(
    "script[nonce]",
  ) as HTMLScriptElement | null;
  const nonce = existing?.nonce || existing?.getAttribute("nonce") || "";
  const scriptEl = doc.createElement("script");
  if (nonce) {
    scriptEl.nonce = nonce;
    scriptEl.setAttribute("nonce", nonce);
  }
  scriptEl.textContent = `try { globalThis[${JSON.stringify(slot)}](function(self, window, globalThis, postMessage, require, module, exports, ${fName}, ${dName}) { let onmessage = null;\n${code}\n;if (typeof onmessage === "function") { self.onmessage = onmessage; } }); } catch (e) { globalThis[${JSON.stringify(slot)}](null, e); }`;
  try {
    doc.head.appendChild(scriptEl);
  } finally {
    captureGlobalOnMessage();
    scriptEl.remove();
    delete globals[slot];
  }
}

function patchBlobAndObjectUrl(
  targetGlobal: Record<PropertyKey, unknown>,
): void {
  const OrigBlob = targetGlobal.Blob as typeof Blob | undefined;
  if (
    OrigBlob &&
    !(OrigBlob as { __lumierePatched?: boolean }).__lumierePatched
  ) {
    class PatchedBlob extends OrigBlob {
      static __lumierePatched = true;
      readonly __sourceText: string;
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        this.__sourceText = (parts ?? [])
          .map((p) => (typeof p === "string" ? p : ""))
          .join("");
      }
    }
    targetGlobal.Blob = PatchedBlob;
  }
  const urlObj = targetGlobal.URL as typeof URL | undefined;
  if (
    urlObj &&
    !(urlObj.createObjectURL as { __lumierePatched?: boolean } | undefined)
      ?.__lumierePatched
  ) {
    const origCreate = urlObj.createObjectURL?.bind(urlObj);
    const createFn = (obj: Blob | MediaSource): string => {
      const src = (obj as { __sourceText?: string } | undefined)?.__sourceText;
      if (typeof src === "string" && src.length > 0) {
        const fakeUrl = `blob:lumiere-worker-${++blobCounter}`;
        blobSourceMap.set(fakeUrl, src);
        return fakeUrl;
      }
      return origCreate ? origCreate(obj) : `blob:lumiere-${++blobCounter}`;
    };
    (createFn as { __lumierePatched?: boolean }).__lumierePatched = true;
    urlObj.createObjectURL = createFn;
  }
}

function createInlineWorkerScope(
  targetGlobal: Record<PropertyKey, unknown>,
  code: string,
  onReply: (data: unknown) => void,
): Record<string, unknown> {
  const local: Record<PropertyKey, unknown> = {
    onmessage: null,
    postMessage: (data: unknown) => {
      queueMicrotask(() => onReply(data));
    },
    addEventListener: (type: string, fn: unknown) => {
      if (type === "message" && typeof fn === "function") {
        local.onmessage = fn;
      }
    },
    removeEventListener: () => {},
  };
  const scope = new Proxy(local, {
    get(target, prop) {
      if (prop === "self" || prop === "window" || prop === "globalThis") {
        return scope;
      }
      if (prop in target) {
        return target[prop];
      }
      const val = Reflect.get(targetGlobal, prop, targetGlobal);
      if (
        typeof val === "function" &&
        (val as { prototype?: unknown }).prototype === undefined
      ) {
        return (val as (...args: unknown[]) => unknown).bind(targetGlobal);
      }
      return val;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  if (code) {
    runWorkerCode(code, scope);
  }
  return scope;
}

class InlineWorker {
  static __lumierePatched = true;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  private readonly listeners = new Map<
    string,
    Set<(ev: { data: unknown }) => void>
  >();
  private readonly scope: Record<string, unknown>;
  private terminated = false;

  constructor(scriptURL: string | URL) {
    const code = blobSourceMap.get(String(scriptURL)) ?? "";
    this.scope = createInlineWorkerScope(globalThis, code, (data) => {
      if (this.terminated) {
        return;
      }
      const ev = { data };
      this.onmessage?.(ev);
      for (const fn of this.listeners.get("message") ?? []) {
        fn(ev);
      }
    });
  }

  postMessage(data: unknown): void {
    if (this.terminated) {
      return;
    }
    queueMicrotask(() => {
      if (this.terminated) {
        return;
      }
      const fn = this.scope.onmessage as
        ((ev: { data: unknown }) => void) | null;
      fn?.({ data });
    });
  }

  addEventListener(type: string, fn: (ev: { data: unknown }) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
  }

  removeEventListener(type: string, fn: (ev: { data: unknown }) => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  terminate(): void {
    this.terminated = true;
  }
}

function installInlineWorkerShim(
  targetGlobal: Record<PropertyKey, unknown>,
): void {
  patchBlobAndObjectUrl(targetGlobal);
  const OrigWorker = targetGlobal.Worker as typeof Worker | undefined;
  if (
    !OrigWorker ||
    !(OrigWorker as { __lumierePatched?: boolean }).__lumierePatched
  ) {
    targetGlobal.Worker = InlineWorker;
  }
}

export function installRuntimeEnv(
  targetGlobal: Record<PropertyKey, unknown> = globalThis,
): void {
  const doc = getDomDocument();
  if (!targetGlobal.document) {
    targetGlobal.document = doc;
  }
  if (!targetGlobal.activeDocument) {
    targetGlobal.activeDocument = targetGlobal.document;
  }
  if (!targetGlobal.window) {
    targetGlobal.window = targetGlobal;
  }
  if (!targetGlobal.activeWindow) {
    targetGlobal.activeWindow = targetGlobal.window;
  }
  if (!targetGlobal.self) {
    targetGlobal.self = targetGlobal;
  }
  if (!targetGlobal.navigator) {
    targetGlobal.navigator = {
      userAgent: "Mozilla/5.0 Chrome/120.0.0.0",
      platform: "Linux x86_64",
      language: "en-US",
    };
  }
  if (!targetGlobal.requestAnimationFrame) {
    targetGlobal.requestAnimationFrame = (cb: FrameRequestCallback) =>
      setTimeout(() => cb(Date.now()), 0);
    targetGlobal.cancelAnimationFrame = (id: ReturnType<typeof setTimeout>) =>
      clearTimeout(id);
  }
  if (!targetGlobal.moment) {
    targetGlobal.moment = moment;
  }
  if (!targetGlobal.CodeMirror) {
    const cmModes: Record<string, unknown> = {};
    targetGlobal.CodeMirror = {
      modes: cmModes,
      defineMode(name: string, fn: unknown) {
        cmModes[name] = fn;
      },
      getMode() {
        return {};
      },
      registerHelper() {},
      Pass: {},
    };
  }
  installObsidianNativePrototypes();
  installObserverAndStyleShims(targetGlobal);
  installStorageShims(targetGlobal);
  installInlineWorkerShim(targetGlobal);
}
