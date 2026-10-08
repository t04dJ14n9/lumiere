import type { Plugin } from "../../kernel";
import type { PanelShell } from "../../shared/runtime";
import type {} from "../vault/api";
import { protocol } from "./protocol";
import { taggedNotes, filterTagNotes } from "./search";
export const tagsHost: Plugin<{ panel: PanelShell }> = {
  name: "tags",
  inject: { required: ["rpc", "vault", "workbench"] },
  apply(ctx) {
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "search", async ({ tag }, token) => {
        const views = ctx.workbench.views;
        const navigation = ctx.workbench.navigation;
        if (!views || !navigation) {
          throw new Error("Tag search is unavailable");
        }
        const items = taggedNotes(ctx.vault, tag);
        const selected = await views.pick({
          placeholder: `#${tag} — ${items.length} ${items.length === 1 ? "note" : "notes"}`,
          items: (query) => filterTagNotes(items, query),
        });
        if (!selected?.item || token.cancelled) {
          return false;
        }
        await navigation.open(
          ctx.vault.root,
          selected.item.value.uri,
          "",
          false,
        );
        return true;
      }),
    );
  },
};
