import type { Context, Plugin } from "@workshop/core";
import type { Configuration } from "../../shared/configuration";
import { OVERRIDE_KEYS } from "./app-settings";
import { ContainedConfigFiles } from "./config-files";
import { hasExplicitSetting } from "./precedence";
import { VaultConfigs } from "./vault-configs";

export const obsidianCompatHost: Plugin = {
  name: "obsidianCompat",
  inject: { required: ["settings", "workspace", "activeEditor", "vaults"] },
  apply(ctx) {
    const configs = createConfigs(ctx);
    registerService(ctx, configs);
    registerOverrides(ctx, configs);
    registerConfigRefresh(ctx, configs);
    registerVaultPreparation(ctx, configs);
  },
};

function createConfigs(ctx: Context): VaultConfigs {
  const configuration = ctx.settings.effective;
  return new VaultConfigs({
    vaults: ctx.vaults,
    configFolder: (root) =>
      configuration.get("obsidianCompat.configFolder", ".obsidian", root) ??
      ".obsidian",
    files: (root, directory) => new ContainedConfigFiles(ctx, root, directory),
    warn: (message, error) => ctx.logger.warn(message, error),
    changed(change) {
      if (ctx.isLive) {
        ctx.emit("obsidianCompat/changed", change);
        configuration?.invalidate();
      }
    },
  });
}
function registerService(ctx: Context, configs: VaultConfigs): void {
  ctx.provide("obsidianCompat", configs);
  ctx.effect(() => () => configs.dispose());
}
function isEnabled(configuration: Configuration, resource: string): boolean {
  return (
    configuration.get("preset", "obsidian", resource) === "obsidian" &&
    configuration.get("plugins.obsidianCompat.enabled", true, resource)
  );
}
function registerOverrides(ctx: Context, configs: VaultConfigs): void {
  const configuration = ctx.settings.effective;
  if (!configuration) {
    return;
  }
  const failures = new Set<string>();
  ctx.effect(() =>
    configuration.register({
      get(key, resource) {
        if (
          !OVERRIDE_KEYS.some((candidate) => candidate === key) ||
          !isEnabled(configuration, resource) ||
          hasExplicitSetting(configuration.inspect(key, resource))
        ) {
          return undefined;
        }
        return configs.cachedOverrides(resource)[key];
      },
      async prepare(resource) {
        if (!isEnabled(configuration, resource)) {
          return;
        }
        try {
          await configs.prepare(resource);
        } catch (error) {
          // A bad compatibility profile must not prevent a Markdown editor opening.
          const failure = `${resource}: ${String(error)}`;
          if (!failures.has(failure)) {
            failures.add(failure);
            ctx.logger.warn(
              "Could not prepare Obsidian vault configuration.",
              error,
            );
          }
        }
      },
    }),
  );
}
function registerConfigRefresh(ctx: Context, configs: VaultConfigs): void {
  ctx.effect(() =>
    ctx.settings.onChange(() => {
      trackRefresh(ctx, configs.reconfigure());
    }),
  );
}
function registerVaultPreparation(ctx: Context, configs: VaultConfigs): void {
  const prepare = (uri: string) => trackRefresh(ctx, configs.prepare(uri));
  ctx.on("editor/opened", (panel) => prepare(panel.document.uri));
  ctx.on("vault/resolved", (root) => prepare(`${root}/`));
  const prepareActive = () => {
    const uri = ctx.activeEditor.note();
    if (uri) {
      prepare(uri);
    }
  };
  ctx.effect(() => ctx.activeEditor.onNoteChanged(prepareActive));
  for (const vault of ctx.vaults.all()) {
    prepare(`${vault.index.root}/`);
  }
  prepareActive();
}
function trackRefresh(ctx: Context, work: Promise<void>): void {
  ctx.track(
    work.catch((error) => {
      if (ctx.isLive) {
        ctx.logger.warn("Could not load Obsidian vault configuration.", error);
      }
    }),
  );
}
