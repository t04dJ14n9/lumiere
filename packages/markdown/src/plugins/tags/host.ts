import type { Plugin } from "@workshop/core";
import type { PanelShell } from "../../shared/host";
import type {} from "../vault/api";
import { protocol } from "./protocol";
import { pickTaggedNote } from "./search";
export const tagsHost: Plugin<{ panel: PanelShell }> = {
  name: "tags",
  inject: { required: ["rpc", "vault", "navigation", "dialogs"] },
  apply(ctx) {
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "search", async ({ tag }, token) => {
        const file = await pickTaggedNote(ctx.dialogs, ctx.vault, tag);
        if (!file || token.cancelled) {
          return false;
        }
        await ctx.navigation.open(ctx.vault.root, file.uri, "", "here");
        return true;
      }),
    );
  },
};
