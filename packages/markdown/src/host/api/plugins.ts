import type { Context } from "@workshop/core";
import type { EditorPanel } from "../../plugins/editor/api";
import type { ApiPlatform } from "./platform";
import type { ExternalPlugins } from "./external-manager";
import type {
  MarkdownWorkshopApi,
  PluginState,
  ConfigurationScope,
  PluginDescriptor,
} from "./types";
import { builtinCatalog } from "./catalog";
import { panelById, waitForReady } from "./editors";
import { RpcError } from "../../shared/rpc/lifecycle";
export function pluginOperations(
  root: Context,
  platform: ApiPlatform,
  external: ExternalPlugins,
): Pick<
  MarkdownWorkshopApi,
  | "getPluginCatalog"
  | "getPlugins"
  | "setPluginEnabled"
  | "resetPluginOverride"
  | "openPluginSettings"
  | "plugin"
> {
  const catalog = () =>
    Object.freeze([...builtinCatalog, ...external.catalog()]);
  const states = (id: string) =>
    Object.freeze([...builtinStates(root, id), ...external.states(id)]);
  const change = async (
    id: string,
    enabled: boolean | undefined,
    scope: ConfigurationScope,
  ) => {
    const descriptor = catalog().find((item) => item.id === id);
    if (!descriptor || descriptor.kind === "core") {
      throw new RpcError(
        "InvalidArgument",
        "Only registered feature and external plugins can be configured",
      );
    }
    validateChange(scope, enabled);
    await platform.write(id, enabled, scope, descriptor.kind === "external");
    await external.refresh();
    root.emit("editor/configure");
    await root.settled();
    await Promise.all(
      root.editors.all().map(async (panel) => {
        await waitForReady(panel);
        await panel.refreshPlugins?.();
      }),
    );
    return Object.freeze({
      id,
      editors: Object.freeze(
        root.editors
          .all()
          .map((panel) =>
            Object.freeze({ editorId: panel.id, states: states(panel.id) }),
          ),
      ),
    });
  };
  return {
    getPluginCatalog: catalog,
    getPlugins: states,
    setPluginEnabled: change,
    resetPluginOverride: (id, scope) => change(id, undefined, scope),
    openPluginSettings: (resource) => platform.settings(resource),
    plugin: (definition) => external.register(definition),
  };
}
function builtinStates(root: Context, id: string): PluginState[] {
  const panel = panelById(root, id);
  const config = root.settings.forNote(panel.document);
  const states = [
    ...root.pluginStates.list(),
    ...(panel.pluginStates?.() ?? []),
  ];
  return builtinCatalog.map((descriptor) => {
    const candidates = states.filter((state) => state.id === descriptor.id);
    const enabled =
      descriptor.kind === "core"
        ? candidates.length > 0
        : config.preset === "obsidian" &&
          (config.features?.[descriptor.id]?.enabled ??
            descriptor.defaultEnabled);
    if (awaitingWebview(panel, descriptor)) {
      candidates.push({
        id: descriptor.id,
        state: "pending",
        waitingFor: ["webview"],
      });
    }
    const priority = { failed: 0, pending: 1, loading: 2, active: 3 };
    const reported = candidates.sort(
      (a, b) => priority[a.state] - priority[b.state],
    )[0];
    const state: PluginState["state"] = enabled
      ? (reported?.state ?? "pending")
      : "disabled";
    return Object.freeze({
      id: descriptor.id,
      enabled,
      state,
      waitingFor: Object.freeze([...(reported?.waitingFor ?? [])]),
      ...(reported?.error ? { error: reported.error } : {}),
    });
  });
}

function validateChange(
  scope: ConfigurationScope,
  enabled: boolean | undefined,
): void {
  if (
    !scope ||
    !["global", "workspace", "workspaceFolder"].includes(scope.target) ||
    (scope.target === "workspaceFolder" && !scope.resource)
  ) {
    throw new RpcError(
      "InvalidArgument",
      "Explicit configuration scope is required",
    );
  }
  if (enabled !== undefined && typeof enabled !== "boolean") {
    throw new RpcError("InvalidArgument", "Enablement must be boolean");
  }
}

function awaitingWebview(
  panel: EditorPanel,
  descriptor: PluginDescriptor,
): boolean {
  return (
    descriptor.surfaces.includes("webview") &&
    !!panel.webviewPluginStates &&
    !panel.webviewPluginStates().some((state) => state.id === descriptor.id)
  );
}
