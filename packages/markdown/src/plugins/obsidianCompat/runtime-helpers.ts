import type { Component, MarkdownRenderChild } from "./obsidian-core";
import type { MarkdownPostProcessorContext } from "./obsidian-workspace";
import { getDomDocument } from "./dom-helpers";
import type { ObsidianPluginManifest, SerializedVaultFile } from "./api";
import { normalizePath } from "./obsidian-core";
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
  if (!styles) {
    return null;
  }
  const styleEl = getDomDocument().createElement("style");
  styleEl.dataset.obsidianPlugin = pluginId;
  styleEl.textContent = styles;
  getDomDocument().head.appendChild(styleEl);
  return styleEl;
}

export function toVaultRelativePath(
  pathOrUri: string,
  vaultRoot: string,
): string {
  const raw = String(pathOrUri ?? "");
  if (!raw) {
    return "";
  }
  const prefix = vaultRoot ? `${vaultRoot.replace(/\/+$/, "")}/` : "";
  if (prefix && raw.startsWith(prefix)) {
    return normalizePath(decodeURIComponent(raw.slice(prefix.length)));
  }
  if (raw.includes("://")) {
    const lastSlash = raw.lastIndexOf("/");
    const tail = lastSlash >= 0 ? raw.slice(lastSlash + 1) : raw;
    return normalizePath(decodeURIComponent(tail));
  }
  return normalizePath(raw);
}

export async function preloadVaultMarkdownFiles(
  app: App,
  files: readonly SerializedVaultFile[],
): Promise<void> {
  const missing = files.filter(
    (item) =>
      item.content === undefined &&
      item.path.toLowerCase().endsWith(".md") &&
      app.vault.getCachedContent(item.path) === undefined,
  );
  await Promise.all(
    missing.map(async (item) => {
      const file = app.vault.getFileByPath(item.path);
      if (!file) {
        return;
      }
      try {
        await app.vault.read(file);
      } catch {
        // Ignore unreadable files during initial bootstrap preload
      }
    }),
  );
}

function appendInlineTokens(parent: HTMLElement, text: string): void {
  const doc = getDomDocument();
  const tokenRe = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parent.appendChild(doc.createTextNode(text.slice(lastIdx, match.index)));
    }
    const a = doc.createElement("a");
    if (match[1] !== undefined) {
      const target = match[1].trim();
      const alias = (match[2] ?? target).trim();
      a.className = "internal-link";
      a.dataset.href = target;
      a.setAttribute("href", target);
      a.textContent = alias;
    } else {
      a.className = "external-link";
      a.setAttribute("href", match[4] ?? "");
      a.textContent = match[3] ?? "";
    }
    parent.appendChild(a);
    lastIdx = tokenRe.lastIndex;
  }
  if (lastIdx < text.length) {
    parent.appendChild(doc.createTextNode(text.slice(lastIdx)));
  }
}

export function renderFallbackMarkdown(
  markdown: string,
  el: HTMLElement,
): void {
  const doc = getDomDocument();
  const fenceMatch = /^```(\w+)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/m.exec(
    markdown.trim(),
  );
  if (fenceMatch) {
    const wrapper = doc.createElement("div");
    wrapper.className = "markdown-rendered";
    const pre = doc.createElement("pre");
    const code = doc.createElement("code");
    if (fenceMatch[1]) {
      code.className = `language-${fenceMatch[1].toLowerCase()}`;
    }
    code.textContent = fenceMatch[2] ?? "";
    pre.appendChild(code);
    wrapper.appendChild(pre);
    el.appendChild(wrapper);
    return;
  }
  const p = doc.createElement("p");
  appendInlineTokens(p, markdown);
  el.appendChild(p);
}

export function buildPostProcessorContext(
  app: App,
  clean: string,
  renderChildren: Set<Component>,
  ownerComponent?: Component,
): MarkdownPostProcessorContext {
  const cache = app.metadataCache.getCache(clean);
  return {
    docId: clean,
    sourcePath: clean,
    frontmatter: cache?.frontmatter ?? null,
    addChild: (child: Component | MarkdownRenderChild) => {
      if (ownerComponent) {
        ownerComponent.addChild(child);
      } else {
        renderChildren.add(child);
        void child.load();
      }
    },
    getSectionInfo: () => {
      const text = app.vault.getCachedContent(clean) ?? "";
      const lines = text.split(/\r?\n/);
      return { text, lineStart: 0, lineEnd: Math.max(0, lines.length - 1) };
    },
  };
}
