import type { Plugin } from "@workshop/core";
import type {} from "../properties/api";
import { bindSources } from "./bind";
import { renderSources } from "./markup";
import { protocol } from "./protocol";

/** Registers Sources rows (open links) beside the editable YAML draft for the property. */
export const sourcesPropertyWebview: Plugin = {
  name: "sourcesProperty",
  inject: { required: ["propertyRenderers", "rpc"] },
  apply(ctx) {
    const lifetime = new AbortController();
    // Session flag: expand-all is DOM-only unless remount/estimate see it too.
    let sourcesExpanded = false;
    ctx.effect(() => () => lifetime.abort());
    ctx.effect(() =>
      ctx.propertyRenderers.register({
        key: "sources",
        render: (value, values) =>
          renderSources(value, values, { expanded: sourcesExpanded }),
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
              },
            },
          ),
      }),
    );
  },
};
