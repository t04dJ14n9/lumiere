import type { Context, Plugin } from "@workshop/core";
import type { PanelShell } from "../../shared/host";
import type {} from "../vault/api";
import { protocol } from "./protocol";
import { SuggestionIndex } from "./sources";
export const suggestHost: Plugin<{ panel: PanelShell }> = {
  name: "suggest",
  inject: {
    required: ["rpc", "vault", "settings"],
    optional: ["vaults", "hostDocuments"],
  },
  apply(ctx, { panel }) {
    const vaults = ctx.vaults;
    const index = new SuggestionIndex(
      ctx.vault,
      vaults && ((file) => vaults.text(file.uri)),
    );
    registerBlockIds(ctx);
    ctx.effect(() =>
      ctx.vault.onDidChange((change) => index.invalidate(change)),
    );
    ctx.effect(() => ctx.vault.onDidResolve(() => index.invalidate()));
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "query", async (request, token) => {
        const feature = request.kind === "tag" ? "tags" : "links";
        const source = ctx.vault
          .files()
          .find((file) => file.uri === panel.document.uri)?.path;
        if (
          token.cancelled ||
          source === undefined ||
          ctx.settings.forNote(panel.document).features?.[feature]?.enabled ===
            false
        ) {
          return [];
        }
        await index.prepare(source, request);
        if (token.cancelled) {
          return [];
        }
        return index.query(
          source,
          request,
          ctx.settings.forNote(panel.document).features?.links?.config
            .useWikilinks !== false,
        );
      }),
    );
  },
};

/**
 * A picked block in another note gets its id there, as in Obsidian, unless
 * that note changed where the id goes.
 */
function registerBlockIds(ctx: Context): void {
  const documents = ctx.hostDocuments;
  ctx.effect(() =>
    ctx.rpc.handle(
      protocol,
      "addBlockId",
      async ({ uri, at, before, insert }) => {
        if (!documents) {
          return false;
        }
        const document = await documents.open(uri);
        const text = documents.text(uri) ?? "";
        if (text.slice(at - before.length, at) !== before) {
          return false;
        }
        return documents.apply(document, [{ from: at, to: at, insert }]);
      },
    ),
  );
}
