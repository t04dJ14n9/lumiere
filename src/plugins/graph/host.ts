import type { Plugin } from "../../kernel";
import type {} from "../okfCore/api";
import type {} from "../vault/api";
import { contributionId } from "../../shared/setting-schema";
import { createGraphSession } from "./session";

/** Window panel for one OKF bundle. It does not follow whichever note is active later. */
export const graphHost: Plugin = {
  name: "graph",
  inject: { required: ["workbench", "vaults", "okf"] },
  apply(ctx) {
    const views = ctx.workbench.views;
    if (!views) {
      return;
    }
    const session = createGraphSession(ctx);
    ctx.effect(() => () => session.dispose());
    ctx.effect(() =>
      views.command(contributionId("graph.open"), () => {
        void session.open().catch((error) => {
          ctx.logger.error("Vault graph open failed", error);
        });
      }),
    );
    ctx.effect(() =>
      views.command(contributionId("graph.chooseBundle"), () => {
        void session.choose().catch((error) => {
          ctx.logger.error("Vault graph bundle choice failed", error);
        });
      }),
    );
    ctx.on("vault/changed", () => session.schedule());
    ctx.on("vault/resolved", () => session.schedule());
    if (ctx.workbench.onConfiguration) {
      ctx.effect(() =>
        ctx.workbench.onConfiguration!(() => session.schedule()),
      );
    }
  },
};
