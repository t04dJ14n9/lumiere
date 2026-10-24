import { getDomDocument } from "./dom-helpers";
import type { ObsidianPluginManifest } from "./api";
import { createPluginRequire } from "./obsidian-module";
import { Plugin } from "./obsidian-plugin";
import type { App } from "./obsidian-workspace";

export type PluginConstructor = new (
  app: App,
  manifest: ObsidianPluginManifest,
) => Plugin;

type FactoryArgs = [
  req: (id: string) => unknown,
  mod: { exports: unknown },
  exports: unknown,
  app: App,
  filename: string,
  dirname: string,
];

export function evaluatePluginModule(
  code: string,
  app: App,
  manifest: ObsidianPluginManifest,
  extraModules?: Readonly<Record<string, unknown>>,
): PluginConstructor {
  const req = createPluginRequire(extraModules);
  const mod: {
    exports: Record<string, unknown> | ((...args: never[]) => unknown);
  } = {
    exports: {},
  };
  const args: FactoryArgs = [
    req,
    mod,
    mod.exports,
    app,
    `.obsidian/plugins/${manifest.id}/main.js`,
    `.obsidian/plugins/${manifest.id}`,
  ];
  runPluginFactory(code, manifest.id, args);
  return extractPluginConstructor(mod.exports, manifest.id);
}

function runPluginFactory(
  code: string,
  manifestId: string,
  args: FactoryArgs,
): void {
  const fName = "__" + "filename";
  const dName = "__" + "dirname";
  try {
    const factory = new Function(
      "require",
      "module",
      "exports",
      "app",
      fName,
      dName,
      `${code}\n//# sourceURL=obsidian-plugin://${manifestId}/main.js`,
    ) as (...fnArgs: unknown[]) => unknown;
    factory(...args);
    return;
  } catch (err) {
    if (!(err instanceof EvalError)) {
      throw err;
    }
  }
  runNoncedScriptFactory(code, manifestId, args);
}

function runNoncedScriptFactory(
  code: string,
  manifestId: string,
  args: FactoryArgs,
): void {
  const fName = "__" + "filename";
  const dName = "__" + "dirname";
  const doc = getDomDocument();
  const globals = globalThis as Record<string, unknown>;
  const slot = `__lumierePluginExec_${manifestId.replace(/[^A-Za-z0-9_]/g, "_")}`;
  let capturedError: unknown;
  globals[slot] = (
    factory: ((...fnArgs: unknown[]) => unknown) | null,
    thrown?: unknown,
  ) => {
    if (thrown !== undefined || !factory) {
      capturedError = thrown;
      return;
    }
    try {
      factory(...args);
    } catch (e) {
      capturedError = e;
    }
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
  scriptEl.textContent = `try { globalThis[${JSON.stringify(slot)}](function(require, module, exports, app, ${fName}, ${dName}) {\n${code}\n}); } catch (e) { globalThis[${JSON.stringify(slot)}](null, e); }\n//# sourceURL=obsidian-plugin://${manifestId}/main.js`;
  try {
    doc.head.appendChild(scriptEl);
  } finally {
    scriptEl.remove();
    delete globals[slot];
  }
  if (capturedError !== undefined) {
    throw capturedError;
  }
}

function extractPluginConstructor(
  exported: unknown,
  manifestId: string,
): PluginConstructor {
  if (typeof exported === "function") {
    return exported as unknown as PluginConstructor;
  }
  if (exported && typeof exported === "object") {
    const record = exported as Record<string, unknown>;
    if (typeof record.default === "function") {
      return record.default as unknown as PluginConstructor;
    }
    for (const val of Object.values(record)) {
      if (
        typeof val === "function" &&
        (val.prototype instanceof Plugin || val === Plugin)
      ) {
        return val as unknown as PluginConstructor;
      }
    }
  }
  throw new Error(
    `Plugin "${manifestId}" did not export a valid Obsidian Plugin class.`,
  );
}

export function createPluginStyleEl(
  pluginId: string,
  styles: string | undefined,
): HTMLStyleElement | null {
  if (!styles || false) {
    return null;
  }
  const styleEl = getDomDocument().createElement("style");
  styleEl.dataset.obsidianPlugin = pluginId;
  styleEl.textContent = styles;
  getDomDocument().head.appendChild(styleEl);
  return styleEl;
}

export function renderFallbackMarkdown(
  markdown: string,
  el: HTMLElement,
): void {
  const wrapper = getDomDocument().createElement("div");
  wrapper.className = "markdown-rendered";
  const fenceMatch = /^```(\w+)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/m.exec(
    markdown.trim(),
  );
  if (fenceMatch) {
    const pre = getDomDocument().createElement("pre");
    const code = getDomDocument().createElement("code");
    if (fenceMatch[1]) {
      code.className = `language-${fenceMatch[1].toLowerCase()}`;
    }
    code.textContent = fenceMatch[2] ?? "";
    pre.appendChild(code);
    wrapper.appendChild(pre);
  } else {
    const p = getDomDocument().createElement("p");
    p.textContent = markdown;
    wrapper.appendChild(p);
  }
  el.appendChild(wrapper);
}
