import { getDomDocument } from "./dom-helpers";
import type { ObsidianPluginManifest } from "./api";
import { createPluginRequire } from "./obsidian-module";
import { Plugin } from "./obsidian-plugin";
import type { App } from "./obsidian-workspace";

export type PluginConstructor = new (
  app: App,
  manifest: ObsidianPluginManifest,
) => Plugin;

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

  const factory = new Function(
    "require",
    "module",
    "exports",
    "app",
    "__" + "filename",
    "__" + "dirname",
    `${code}\n//# sourceURL=obsidian-plugin://${manifest.id}/main.js`,
  ) as (...args: unknown[]) => unknown;

  factory(
    req,
    mod,
    mod.exports,
    app,
    `.obsidian/plugins/${manifest.id}/main.js`,
    `.obsidian/plugins/${manifest.id}`,
  );
  return extractPluginConstructor(mod.exports, manifest.id);
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
