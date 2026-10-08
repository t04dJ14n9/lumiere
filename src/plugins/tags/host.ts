import type { Plugin } from "../../kernel";
import type { PanelShell } from "../../shared/runtime";
import type {} from "../vault/api";
import { protocol } from "./protocol";
import { pickTaggedNote } from "./search";
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
        const file = await pickTaggedNote(views, ctx.vault, tag);
        if (!file || token.cancelled) {
          return false;
        }
        await navigation.open(ctx.vault.root, file.uri, "", false);
        return true;
      }),
    );
  },
};
