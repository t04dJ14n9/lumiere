import type { Context, Plugin, Infer } from "@workshop/core";
import type {} from "../properties/api";
import { bindSources } from "./bind";
import { renderSources } from "./markup";
import { protocol } from "./protocol";
import { config } from "./manifest";
import { listPreviewCount } from "../../markdown/properties/list-preview";

const configurations = new WeakMap<
  Context,
  (settings: Infer<typeof config>) => void
>();

/** Registers Sources stacked rows as the typed OKF UI for the `sources` property. */
export const sourcesPropertyWebview: Plugin<Infer<typeof config>> = {
  name: "sourcesProperty",
  inject: { required: ["propertyRenderers", "rpc"] },
  config,
  reconfigure(ctx, settings) {
    const configure = configurations.get(ctx);
    if (!configure) {
      return false;
    }
    configure(settings);
    return true;
  },
  apply(ctx, settings) {
    const lifetime = new AbortController();
    let sourcesExpanded = false;
    let preview = listPreviewCount(settings.listPreviewCount);
    configurations.set(ctx, (next) => {
      preview = listPreviewCount(next.listPreviewCount);
      if (ctx.isLive) {
        ctx.emit("render/changed");
      }
    });
    ctx.effect(() => {
      return () => {
        lifetime.abort();
        configurations.delete(ctx);
      };
    });
    ctx.effect(() =>
      ctx.propertyRenderers.register({
        key: "sources",
        render: (value, values) =>
          renderSources(value, values, {
            expanded: sourcesExpanded,
            previewCount: preview,
          }),
        bind: (root) =>
          bindSources(
            root as ParentNode,
            lifetime.signal,
            (resource) => {
              void ctx.rpc
                .call(protocol, "open", { resource })
                .catch((error) =>
                  ctx.logger.error("Source open failed", error),
                );
            },
            {
              onExpand: () => {
                sourcesExpanded = true;
                // Preview markup omits extras; remount with expanded rows.
                if (ctx.isLive) {
                  ctx.emit("render/changed");
                }
              },
            },
          ),
      }),
    );
  },
};
