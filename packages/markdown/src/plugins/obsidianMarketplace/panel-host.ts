import type { Context, Plugin } from "@workshop/core";
import type { PanelShell } from "../../shared/host";
import { protocol as compatProtocol } from "../obsidianCompat/protocol";
import type {} from "../vault/api";
import type {
  MarketplaceMutationResult,
  MarketplacePluginEntry,
  ObsidianMarketplace,
} from "./api";
import type { FetchLike } from "./catalog-parser";
import { CommunityMarketplaceService } from "./marketplace-service";
import { protocol } from "./protocol";

export interface MarketplacePanelConfig {
  readonly panel: PanelShell;
  readonly fetchFn?: FetchLike;
}

export const obsidianMarketplacePanelHost: Plugin<MarketplacePanelConfig> = {
  name: "obsidianMarketplace",
  inject: {
    required: ["rpc", "vault", "workspace", "settings"],
    optional: ["obsidianMarketplace"],
  },
  apply(ctx, config) {
    const { panel } = config;
    const service: ObsidianMarketplace =
      ctx.obsidianMarketplace ??
      new CommunityMarketplaceService({
        workspace: ctx.workspace,
        ...(config.fetchFn ? { fetchFn: config.fetchFn } : {}),
      });
    registerCatalogRpc(ctx, panel, service);
    registerMutationRpc(ctx, panel, service);
  },
};

function registerCatalogRpc(
  ctx: Context,
  panel: PanelShell,
  service: ObsidianMarketplace,
): void {
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "listCatalog", async ({ forceRefresh }) => {
      const snapshot = await service.listCatalog(
        String(ctx.vault.root),
        configuredFolder(ctx, panel),
        forceRefresh,
      );
      return {
        trusted: snapshot.trusted,
        configDir: snapshot.configDir,
        items: [...snapshot.items],
      };
    }),
  );
}

function registerMutationRpc(
  ctx: Context,
  panel: PanelShell,
  service: ObsidianMarketplace,
): void {
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "installPlugin", async ({ id, repo }) => {
      const result = await service.installPlugin(
        String(ctx.vault.root),
        configuredFolder(ctx, panel),
        id,
        repo,
      );
      return broadcastMutation(ctx, result);
    }),
  );
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "setPluginEnabled", async ({ id, enabled }) => {
      const result = await service.setPluginEnabled(
        String(ctx.vault.root),
        configuredFolder(ctx, panel),
        id,
        enabled,
      );
      return broadcastMutation(ctx, result);
    }),
  );
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "uninstallPlugin", async ({ id }) => {
      const result = await service.uninstallPlugin(
        String(ctx.vault.root),
        configuredFolder(ctx, panel),
        id,
      );
      return broadcastMutation(ctx, result);
    }),
  );
}

function broadcastMutation(
  ctx: Context,
  result: MarketplaceMutationResult,
): {
  trusted: boolean;
  configDir: string;
  enabledIds: string[];
  item?: MarketplacePluginEntry;
  items: MarketplaceMutationResult["items"][number][];
  plugins: MarketplaceMutationResult["plugins"][number][];
} {
  const vaultRoot = String(ctx.vault.root);
  ctx.emit("obsidianCompat/pluginsChanged", { vaultRoot });
  ctx.emit("obsidianMarketplace/changed", { vaultRoot });
  ctx.rpc.notify(compatProtocol, "pluginsChanged", {
    trusted: result.trusted,
    configDir: result.configDir,
    plugins: [...result.plugins],
  });
  ctx.rpc.notify(protocol, "catalogUpdated", {
    trusted: result.trusted,
    configDir: result.configDir,
    items: [...result.items],
  });
  return {
    trusted: result.trusted,
    configDir: result.configDir,
    enabledIds: [...result.enabledIds],
    ...(result.item ? { item: result.item } : {}),
    items: [...result.items],
    plugins: [...result.plugins],
  };
}

function configuredFolder(ctx: Context, panel: PanelShell): string | undefined {
  const noteSettings = ctx.settings.forNote(panel.document);
  const raw = noteSettings?.features?.obsidianCompat?.config?.configFolder;
  return typeof raw === "string" ? raw : undefined;
}
