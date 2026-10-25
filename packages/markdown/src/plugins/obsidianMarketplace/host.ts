import type { Context, Plugin } from "@workshop/core";
import { contributionId } from "../../shared/setting-schema";
import type { Vault, Vaults } from "../vault/api";
import type { MarketplacePluginEntry } from "./api";
import { filterMarketplaceItems, type FetchLike } from "./catalog-parser";
import { CommunityMarketplaceService } from "./marketplace-service";
import { protocol } from "./protocol";

export interface ObsidianMarketplaceHostConfig {
  readonly fetchFn?: FetchLike;
}

export const obsidianMarketplaceHost: Plugin<ObsidianMarketplaceHostConfig | void> =
  {
    name: "obsidianMarketplace",
    inject: {
      required: [
        "workspace",
        "settings",
        "hostCommands",
        "dialogs",
        "vaults",
        "activeEditor",
        "editors",
      ],
      optional: ["obsidianCompat"],
    },
    provides: ["obsidianMarketplace"],
    apply(ctx, config) {
      const service = new CommunityMarketplaceService({
        workspace: ctx.workspace,
        ...(config?.fetchFn ? { fetchFn: config.fetchFn } : {}),
        onChanged(vaultRoot) {
          if (ctx.isLive) {
            ctx.emit("obsidianMarketplace/changed", { vaultRoot });
            ctx.emit("obsidianCompat/pluginsChanged", { vaultRoot });
          }
        },
      });
      ctx.provide("obsidianMarketplace", service);
      ctx.effect(() =>
        ctx.hostCommands.register(
          contributionId("obsidianMarketplace.open"),
          (arg?: unknown) => openMarketplaceCommand(ctx, service, arg),
        ),
      );
    },
  };

async function openMarketplaceCommand(
  ctx: Context,
  service: CommunityMarketplaceService,
  arg?: unknown,
): Promise<void> {
  const options =
    arg && typeof arg === "object"
      ? (arg as { query?: string; quickPick?: boolean })
      : {};
  const activePanel = ctx.editors.active();
  if (activePanel && !options.quickPick) {
    activePanel.rpc.notify(protocol, "openModal", {
      ...(typeof options.query === "string" ? { query: options.query } : {}),
    });
    return;
  }
  await runQuickPickMarketplace(ctx, service, options.query);
}

async function runQuickPickMarketplace(
  ctx: Context,
  service: CommunityMarketplaceService,
  initialQuery?: string,
): Promise<void> {
  if (!ctx.workspace.isTrusted()) {
    ctx.dialogs.error(
      "Trust this workspace to browse and install Obsidian community plugins.",
    );
    return;
  }
  const activeUri = ctx.activeEditor.note();
  const vault = await resolveTargetVault(ctx.vaults, activeUri);
  if (!vault) {
    ctx.dialogs.error(
      "Open a vault folder to manage Obsidian community plugins.",
    );
    return;
  }
  const configFolder =
    ctx.settings.effective?.get(
      "obsidianCompat.configFolder",
      ".obsidian",
      vault.index.root,
    ) ?? ".obsidian";
  const snapshot = await service.listCatalog(vault.index.root, configFolder);
  const picked = await ctx.dialogs.pick<MarketplacePluginEntry>({
    placeholder:
      "Search Obsidian community plugins to install, enable, disable, or uninstall…",
    items: (query) =>
      filterMarketplaceItems(snapshot.items, {
        query: query || initialQuery || "",
      }).map((entry) => ({
        label: entry.name,
        description: formatEntryBadge(entry),
        detail: `${entry.author ? `by ${entry.author} — ` : ""}${entry.description}`,
        value: entry,
      })),
  });
  if (!picked?.item) {
    return;
  }
  await handlePickedPlugin(ctx, service, {
    vaultRoot: vault.index.root,
    configFolder,
    entry: picked.item.value,
  });
}

async function handlePickedPlugin(
  ctx: Context,
  service: CommunityMarketplaceService,
  target: {
    readonly vaultRoot: string;
    readonly configFolder: string;
    readonly entry: MarketplacePluginEntry;
  },
): Promise<void> {
  const { vaultRoot, configFolder, entry } = target;
  if (!entry.installed) {
    await service.installPlugin(vaultRoot, configFolder, entry.id, entry.repo);
    ctx.dialogs.inform(`Installed and enabled "${entry.name}".`);
    return;
  }
  const toggleAction = entry.enabled ? "Disable" : "Enable";
  const actions = [toggleAction, "Update", "Uninstall"];
  const choice = await ctx.dialogs.ask(
    `Manage "${entry.name}" (${entry.installedVersion ?? "installed"})`,
    actions,
  );
  if (choice === "Enable" || choice === "Disable") {
    await service.setPluginEnabled(
      vaultRoot,
      configFolder,
      entry.id,
      choice === "Enable",
    );
  } else if (choice === "Update") {
    await service.installPlugin(vaultRoot, configFolder, entry.id, entry.repo);
  } else if (choice === "Uninstall") {
    await service.uninstallPlugin(vaultRoot, configFolder, entry.id);
  }
}

function formatEntryBadge(entry: MarketplacePluginEntry): string {
  const parts: string[] = [];
  if (entry.installedVersion) {
    parts.push(`v${entry.installedVersion}`);
  }
  if (entry.enabled) {
    parts.push("Enabled");
  } else if (entry.installed) {
    parts.push("Installed");
  }
  if (entry.downloads > 0) {
    parts.push(`${entry.downloads.toLocaleString()} downloads`);
  }
  return parts.join(" · ");
}

async function resolveTargetVault(
  vaults: Vaults,
  active: string | undefined,
): Promise<Vault | undefined> {
  const located = active ? await vaults.locate(active) : undefined;
  return located?.vault ?? (await vaults.forWorkspace());
}
