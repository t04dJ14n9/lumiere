import type { Context, Plugin } from "@workshop/core";
import type { PanelShell } from "../../shared/host";
import { joinVaultPath } from "../../shared/vault-path";
import { joinContained } from "../../shared/workspace-path";
import type {} from "../vault/api";
import type { SerializedVaultFile } from "./api";
import { CommunityPluginLoader } from "./community-plugins";
import { resolveConfigDirectory } from "./config-dir";
import { protocol } from "./protocol";

export const obsidianCompatPanelHost: Plugin<{ panel: PanelShell }> = {
  name: "obsidianCompat",
  inject: {
    required: ["rpc", "vault", "workspace", "settings"],
    optional: ["vaults", "navigation"],
  },
  apply(ctx, { panel }) {
    const loader = new CommunityPluginLoader({ workspace: ctx.workspace });
    registerBootstrapHandlers(ctx, panel, loader);
    ctx.on("obsidianCompat/pluginsChanged", (change) => {
      if (!change.vaultRoot || change.vaultRoot === String(ctx.vault.root)) {
        void notifyPluginsChanged(ctx, panel, loader);
      }
    });
    registerVaultReadHandlers(ctx, panel);
    registerVaultWriteHandlers(ctx);
    ctx.effect(() =>
      ctx.vault.onDidChange(() => {
        ctx.rpc.notify(protocol, "vaultChanged", {
          activePath: activeVaultPath(ctx.vault.root, panel.document.uri),
          files: snapshotVaultFiles(ctx),
        });
      }),
    );
    const rootUri = typeof ctx.vault.root === "string" ? ctx.vault.root : "";
    if (rootUri.includes("://")) {
      const configDirUri = resolveConfigDirectory(
        rootUri,
        configuredFolder(ctx, panel),
      );
      const listUri = joinContained(configDirUri, "community-plugins.json");
      if (listUri) {
        ctx.effect(() =>
          ctx.workspace.watch(listUri, () => {
            void notifyPluginsChanged(ctx, panel, loader);
          }),
        );
      }
      void notifyPluginsChanged(ctx, panel, loader);
    }
  },
};

function registerBootstrapHandlers(
  ctx: Context,
  panel: PanelShell,
  loader: CommunityPluginLoader,
): void {
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "bootstrap", async () => {
      const rootUri = String(ctx.vault.root);
      const loaded = await loader.loadEnabledPlugins(
        rootUri,
        configuredFolder(ctx, panel),
      );
      return {
        trusted: loaded.trusted,
        vaultRoot: rootUri,
        vaultName: vaultNameFromRoot(rootUri),
        configDir: loaded.configDir,
        activePath: activeVaultPath(rootUri, panel.document.uri),
        files: snapshotVaultFiles(ctx),
        plugins: [...loaded.plugins],
      };
    }),
  );
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "loadPluginData", async ({ pluginId }) => ({
      data: await loader.loadPluginData(
        String(ctx.vault.root),
        configuredFolder(ctx, panel),
        pluginId,
      ),
    })),
  );
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "savePluginData", async ({ pluginId, data }) => {
      await loader.savePluginData(
        String(ctx.vault.root),
        configuredFolder(ctx, panel),
        pluginId,
        data,
      );
      return true;
    }),
  );
}

function registerVaultReadHandlers(ctx: Context, panel: PanelShell): void {
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "vaultRead", async ({ path }) => {
      const uri = await authorizeVaultFile(ctx, path, false);
      if (ctx.vaults) {
        try {
          return { content: await ctx.vaults.text(uri) };
        } catch {
          // Fall back to direct workspace read below.
        }
      }
      const bytes = await ctx.workspace.read(uri);
      return { content: new TextDecoder("utf-8").decode(bytes) };
    }),
  );
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "vaultExists", async ({ path }) => {
      const normalized = normalizeVaultPath(path);
      if (ctx.vault.file(normalized)) {
        return true;
      }
      try {
        const uri = await authorizeVaultFile(ctx, normalized, false);
        await ctx.workspace.stat(uri);
        return true;
      } catch {
        return false;
      }
    }),
  );
  ctx.effect(() =>
    ctx.rpc.handle(
      protocol,
      "openLinkText",
      async ({ linktext, sourcePath, newLeaf }) => {
        const fallbackSource =
          sourcePath ||
          activeVaultPath(String(ctx.vault.root), panel.document.uri);
        const target = ctx.vault.resolveLink(
          linktext,
          fallbackSource,
          "wikilink",
        );
        if (!target || !ctx.navigation) {
          return false;
        }
        await ctx.navigation.open(
          String(ctx.vault.root),
          target.uri,
          "",
          newLeaf ? "side" : "here",
        );
        return true;
      },
    ),
  );
}

function registerVaultWriteHandlers(ctx: Context): void {
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "vaultModify", async ({ path, data }) => {
      const uri = await authorizeVaultFile(ctx, path, true);
      await ctx.workspace.files.writeText(uri, data);
      return {
        mtime: Date.now(),
        size: new TextEncoder().encode(data).byteLength,
      };
    }),
  );
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "vaultCreate", async ({ path, data }) => {
      const normalized = normalizeVaultPath(path);
      const uri = await authorizeVaultFile(ctx, normalized, true);
      await ctx.workspace.files.writeText(uri, data);
      return {
        path: normalized,
        mtime: Date.now(),
        size: new TextEncoder().encode(data).byteLength,
      };
    }),
  );
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "vaultCreateFolder", async ({ path }) => {
      const normalized = normalizeVaultPath(path);
      const uri = await authorizeVaultFile(ctx, normalized, true);
      await ctx.workspace.files.mkdir(uri);
      return { path: normalized };
    }),
  );
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "vaultDelete", async ({ path }) => {
      const uri = await authorizeVaultFile(ctx, path, true);
      await ctx.workspace.files.remove(uri);
      return true;
    }),
  );
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "vaultRename", async ({ path, newPath }) => {
      const normalizedOld = normalizeVaultPath(path);
      const normalizedNew = normalizeVaultPath(newPath);
      const fromUri = await authorizeVaultFile(ctx, normalizedOld, true);
      const toUri = await authorizeVaultFile(ctx, normalizedNew, true);
      await ctx.workspace.files.move(fromUri, toUri);
      return { path: normalizedOld, newPath: normalizedNew };
    }),
  );
}

async function notifyPluginsChanged(
  ctx: Context,
  panel: PanelShell,
  loader: CommunityPluginLoader,
): Promise<void> {
  try {
    const loaded = await loader.loadEnabledPlugins(
      String(ctx.vault.root),
      configuredFolder(ctx, panel),
    );
    ctx.rpc.notify(protocol, "pluginsChanged", {
      trusted: loaded.trusted,
      configDir: loaded.configDir,
      plugins: [...loaded.plugins],
    });
  } catch {
    // Ignore transient watcher errors during external edits.
  }
}

function configuredFolder(ctx: Context, panel: PanelShell): string | undefined {
  const noteSettings = ctx.settings.forNote(panel.document);
  const raw = noteSettings?.features?.obsidianCompat?.config?.configFolder;
  return typeof raw === "string" ? raw : undefined;
}

function snapshotVaultFiles(ctx: Context): SerializedVaultFile[] {
  const raw = ctx.vault.files();
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((file) => ({
    path: file.path,
    mtime: file.mtime,
    size: file.size,
  }));
}

function activeVaultPath(vaultRoot: string, documentUri: string): string {
  const prefix = `${vaultRoot.replace(/\/+$/, "")}/`;
  if (typeof documentUri === "string" && documentUri.startsWith(prefix)) {
    return decodeURIComponent(documentUri.slice(prefix.length));
  }
  return "";
}

function vaultNameFromRoot(vaultRoot: string): string {
  const trimmed = vaultRoot.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  return (
    decodeURIComponent(slash >= 0 ? trimmed.slice(slash + 1) : trimmed) ||
    "vault"
  );
}

function normalizeVaultPath(raw: string): string {
  const normalized = joinVaultPath(raw);
  if (!normalized) {
    throw new Error(`Invalid vault path: ${raw}`);
  }
  return normalized;
}

async function authorizeVaultFile(
  ctx: Context,
  rawPath: string,
  requireTrust: boolean,
): Promise<string> {
  if (requireTrust && !ctx.workspace.isTrusted()) {
    throw new Error("Vault write operations require a trusted workspace.");
  }
  const normalized = normalizeVaultPath(rawPath);
  const rootUri = String(ctx.vault.root);
  const targetUri = joinContained(rootUri, normalized);
  if (!targetUri) {
    throw new Error(`Path escapes vault root: ${rawPath}`);
  }
  const authorize = ctx.workspace.files.authorize;
  if (!authorize) {
    throw new Error("Contained vault file access is unavailable.");
  }
  await authorize(rootUri, targetUri);
  return targetUri;
}
