import type { Plugin } from "@workshop/core";
import type { PanelShell } from "../../shared/host";
import type {} from "../vault/api";
import { protocol } from "./protocol";
import { SearchWorker } from "./runner";
import { searchVault } from "./query";
import { resolveSearchOpen } from "./open";
export const searchHost: Plugin<{ panel: PanelShell }> = {
  name: "search",
  inject: { required: ["rpc", "vault", "vaults", "extensions"] },
  apply(ctx) {
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "query", async (request, token) => {
        const path = ctx.extensions.workerPath("search");
        if (!path) {
          throw new Error("Search worker is unavailable");
        }
        const worker = new SearchWorker(path, request.query, { token });
        try {
          return await searchVault({
            vault: ctx.vault,
            source: request.source,
            query: request.query,
            worker,
            token,
            read: (uri) => ctx.vaults.text(uri),
            ...(request.id
              ? {
                  onPartial: (snapshot) =>
                    ctx.rpc.notify(protocol, "partial", {
                      id: request.id!,
                      results: snapshot.results,
                      unreadable: snapshot.unreadable,
                    }),
                }
              : {}),
          });
        } finally {
          await worker.dispose();
        }
      }),
    );
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "open", async (target) => {
        const resolved = resolveSearchOpen(ctx.vault, target);
        if (!resolved) {
          return false;
        }
        await ctx.vaults.open(resolved.uri, resolved.options);
        return true;
      }),
    );
    ctx.effect(() =>
      ctx.vault.onDidResolve(() => ctx.rpc.notify(protocol, "changed", {})),
    );
  },
};
