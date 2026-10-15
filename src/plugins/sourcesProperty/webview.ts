import type { Plugin } from "../../kernel";
import type {} from "../properties/api";
import { bindSources } from "./bind";
import { renderSources } from "./markup";
import { protocol } from "./protocol";

/** Registers the read-only Sources renderer. There is no edit or add control. */
export const sourcesPropertyWebview: Plugin = {
  name: "sourcesProperty",
  inject: { required: ["propertyRenderers", "rpc"] },
  apply(ctx) {
    const lifetime = new AbortController();
    ctx.effect(() => () => lifetime.abort());
    ctx.effect(() =>
      ctx.propertyRenderers.register({
        key: "sources",
        render: (value, values) => renderSources(value, values),
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
            (text) => {
              void ctx.rpc
                .call(protocol, "copy", { text })
                .catch((error) =>
                  ctx.logger.error("Source copy failed", error),
                );
            },
          ),
      }),
    );
  },
};
