import type { Plugin } from "../../kernel";
import type { PanelShell } from "../../shared/runtime";
import type {} from "../vault/api";
import { protocol } from "./protocol";
import { suggestions } from "./sources";
export const suggestHost: Plugin<{ panel: PanelShell }> = {
  name: "suggest",
  inject: { required: ["rpc", "vault", "workbench"] },
  apply(ctx, { panel }) {
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "query", (request, token) => {
        const feature = request.kind === "tag" ? "tags" : "links";
        const source = ctx.vault
          .files()
          .find((file) => file.uri === panel.document.uri)?.path;
        if (
          token.cancelled ||
          source === undefined ||
          ctx.workbench.config(panel.document).features?.[feature]?.enabled ===
            false
        ) {
          return [];
        }
        return suggestions(ctx.vault, source, request);
      }),
    );
  },
};
