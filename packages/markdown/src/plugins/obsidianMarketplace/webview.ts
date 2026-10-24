import type { Context, Plugin } from "@workshop/core";
import type {} from "../commands/api";
import type {} from "../editor/api";
import type { CommunityPluginBundle } from "../obsidianCompat/api";

interface RuntimePluginSink {
  setTrusted(trusted: boolean): void;
  syncCommunityPlugins(
    plugins: readonly CommunityPluginBundle[],
  ): Promise<void>;
}
import type { MarketplaceMutationResult } from "./api";
import { ObsidianMarketplaceModalController } from "./marketplace-modal";
import { protocol } from "./protocol";

export { ObsidianMarketplaceModalController } from "./marketplace-modal";

async function syncRuntimePlugins(
  ctx: Context,
  plugins: readonly CommunityPluginBundle[],
  trusted: boolean,
): Promise<void> {
  const runtime = (globalThis as Record<string, unknown>)
    .__lumiereObsidianRuntime as RuntimePluginSink | undefined;
  if (!runtime) {
    return;
  }
  runtime.setTrusted(trusted);
  await runtime.syncCommunityPlugins(plugins);
  ctx.emit("render/changed");
}

function createModalController(
  ctx: Context,
): ObsidianMarketplaceModalController {
  const handleMutation = async (
    promise: Promise<MarketplaceMutationResult>,
  ): Promise<MarketplaceMutationResult> => {
    const result = await promise;
    await syncRuntimePlugins(ctx, result.plugins, result.trusted);
    return result;
  };
  return new ObsidianMarketplaceModalController(
    () => ctx.editor.view.dom.ownerDocument,
    {
      listCatalog: (forceRefresh) =>
        ctx.rpc.call(protocol, "listCatalog", {
          ...(typeof forceRefresh === "boolean" ? { forceRefresh } : {}),
        }),
      installPlugin: (id, repo) =>
        handleMutation(
          ctx.rpc.call(protocol, "installPlugin", {
            id,
            ...(typeof repo === "string" && repo.length > 0 ? { repo } : {}),
          }),
        ),
      setPluginEnabled: (id, enabled) =>
        handleMutation(
          ctx.rpc.call(protocol, "setPluginEnabled", { id, enabled }),
        ),
      uninstallPlugin: (id) =>
        handleMutation(ctx.rpc.call(protocol, "uninstallPlugin", { id })),
    },
  );
}

export const obsidianMarketplaceWebview: Plugin = {
  name: "obsidianMarketplace",
  inject: { required: ["editor", "commands", "rpc"] },
  apply(ctx: Context) {
    const modal = createModalController(ctx);
    (globalThis as Record<string, unknown>).__lumiereObsidianMarketplace =
      modal;

    ctx.effect(() =>
      ctx.commands.register("obsidianMarketplace:open", () => {
        void modal.open();
        return true;
      }),
    );

    ctx.effect(() =>
      ctx.rpc.on(protocol, "openModal", ({ query }) => {
        void modal.open(query);
      }),
    );

    ctx.effect(() =>
      ctx.rpc.on(protocol, "catalogUpdated", (snapshot) => {
        modal.applyExternalSnapshot(snapshot);
      }),
    );

    ctx.effect(() => () => {
      modal.close();
      const globals = globalThis as Record<string, unknown>;
      if (globals.__lumiereObsidianMarketplace === modal) {
        delete globals.__lumiereObsidianMarketplace;
      }
    });
  },
};
