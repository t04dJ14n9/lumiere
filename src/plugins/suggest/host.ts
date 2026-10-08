import type { Plugin } from "../../kernel";
import type { PanelShell } from "../../shared/runtime";
import type {} from "../vault/api";
import { protocol } from "./protocol";
import { SuggestionIndex } from "./sources";
export const suggestHost: Plugin<{ panel: PanelShell }> = {
  name: "suggest",
  inject: { required: ["rpc", "vault", "workbench"] },
  apply(ctx, { panel }) {
    const index = new SuggestionIndex(ctx.vault);
    ctx.effect(() =>
      ctx.vault.onDidChange((change) => index.invalidate(change)),
    );
    ctx.effect(() => ctx.vault.onDidResolve(() => index.invalidate()));
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
        return index.query(
          source,
          request,
          ctx.workbench.config(panel.document).features?.links?.config
            .useWikilinks !== false,
        );
      }),
    );
  },
};
