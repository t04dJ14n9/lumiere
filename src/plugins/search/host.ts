import type { Plugin } from "@workshop/core";
import type { PanelShell } from "../../shared/runtime";
import type {} from "../vault/api";
import { protocol } from "./protocol";
import { SearchWorker } from "./runner";
import { searchVault } from "./query";
export const searchHost: Plugin<{ panel: PanelShell }> = {
  name: "search",
  inject: { required: ["rpc", "vault", "vaults", "workshop"] },
  apply(ctx) {
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "query", async (request, token) => {
        const path = ctx.workshop.workerPath?.("search");
        if (!path) {
          throw new Error("Search worker is unavailable");
        }
        const worker = new SearchWorker(path, request.query, { token });
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
