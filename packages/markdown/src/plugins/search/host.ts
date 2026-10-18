import type { Plugin } from "@workshop/core";
import type { PanelShell } from "../../shared/host";
import type {} from "../vault/api";
import { protocol } from "./protocol";
import { SearchWorker } from "./runner";
import { searchVault } from "./query";
export const searchHost: Plugin<{ panel: PanelShell }> = {
  name: "search",
  inject: { required: ["rpc", "vault", "vaults", "extensions"] },
  apply(ctx) {
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "query", async (request, token) => {
        const worker = new SearchWorker(ctx.extensions.workers, request.query, {
          token,
        });
        try {
          return await searchVault({
            vault: ctx.vault,
            source: request.source,
            worker,
            token,
            read: (uri) => ctx.vaults.text(uri),
          });
        } finally {
          await worker.dispose();
        }
      }),
    );
    ctx.effect(() =>
      ctx.vault.onDidResolve(() => ctx.rpc.notify(protocol, "changed", {})),
    );
  },
};
