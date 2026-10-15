import type { Uri } from "vscode";
import type { Context } from "../../kernel";
import type { PickItem } from "../../shared/runtime";
import { contributionId } from "../../shared/setting-schema";
import type { ApiPlatform } from "./platform";
import type {
  MarkdownWorkshopApi,
  PluginDescriptor,
  PluginState,
} from "./types";

/** What choosing a row of Show Plugin Status opens. */
export interface PluginStatusTarget {
  readonly id: string;
  /** The setting that turns the plugin on or off; core plugins have none. */
  readonly setting?: string;
}

const order: Record<PluginState["state"], number> = {
  failed: 0,
  pending: 1,
  loading: 2,
  active: 3,
  disabled: 4,
};
const icons: Record<PluginState["state"], string> = {
  failed: "$(error)",
  pending: "$(clock)",
  loading: "$(loading~spin)",
  active: "$(pass)",
  disabled: "$(circle-slash)",
};

function stateText(state: PluginState): string {
  switch (state.state) {
    case "failed":
      return "Failed";
    case "pending":
      return state.waitingFor.length
        ? `Waiting for ${state.waitingFor.join(", ")}`
        : "Waiting";
    case "loading":
      return "Loading";
    case "active":
      return "Active";
    case "disabled":
      return "Disabled";
  }
}

function settingOf(descriptor: PluginDescriptor): string | undefined {
  if (descriptor.kind === "feature") {
    return contributionId(`plugins.${descriptor.id}.enabled`);
  }
  if (descriptor.kind === "external") {
    return contributionId("plugins.external");
  }
  return undefined;
}

/**
 * One row per plugin of an editor (DESIGN §5.7): problems first, so a failed
 * or blocked plugin is never below the fold, then catalog order.
 */
export function pluginStatusItems(
  catalog: readonly PluginDescriptor[],
  states: readonly PluginState[],
): PickItem<PluginStatusTarget>[] {
  const rows = states.flatMap((state, index) => {
    const descriptor = catalog.find((item) => item.id === state.id);
    return descriptor ? [{ state, descriptor, index }] : [];
  });
  rows.sort(
    (a, b) => order[a.state.state] - order[b.state.state] || a.index - b.index,
  );
  return rows.map(({ state, descriptor }) => {
    const setting = settingOf(descriptor);
    return {
      label: `${icons[state.state]} ${descriptor.title}`,
      description: `${stateText(state)} · ${descriptor.kind}`,
      detail: state.error ?? descriptor.description,
      value: setting ? { id: descriptor.id, setting } : { id: descriptor.id },
    };
  });
}

async function showPluginStatus(
  ctx: Context,
  api: MarkdownWorkshopApi,
  platform: ApiPlatform,
): Promise<void> {
  const editor = api.getActiveEditor();
  const views = ctx.workshop.views;
  if (!editor || !views) {
    ctx.workshop.inform?.(
      "Open a note in Markdown Workshop to see its plugin states.",
    );
    return;
  }
  const items = pluginStatusItems(
    api.getPluginCatalog(),
    api.getPlugins(editor.editorId),
  );
  const chosen = await views.pick({
    placeholder: `Plugins in ${basename(editor.uri)}: choose one to open its setting`,
    items: (query) => filterItems(items, query),
  });
  const setting = chosen?.item?.value.setting;
  if (setting) {
    await platform.settings(editor.uri, setting);
  }
}

function filterItems<T>(
  items: readonly PickItem<T>[],
  query: string,
): PickItem<T>[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const text = `${item.label} ${item.description ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

function basename(uri: Uri): string {
  return uri.path.split("/").pop() ?? uri.toString();
}

/** Manage Plugins and Show Plugin Status (DESIGN §6.5). */
export function registerPluginManagement(
  ctx: Context,
  api: MarkdownWorkshopApi,
  platform: ApiPlatform,
): void {
  ctx.effect(() =>
    ctx.workshop.command(contributionId("managePlugins"), () =>
      api.openPluginSettings(api.getActiveEditor()?.uri),
    ),
  );
  ctx.effect(() =>
    ctx.workshop.command(contributionId("showPluginStatus"), () =>
      showPluginStatus(ctx, api, platform),
    ),
  );
}
