import type { Plugin } from "../../kernel";
import type {} from "../commands/api";
import type {} from "../editor/api";
import type {} from "../document/api";
import { protocol } from "./protocol";
export const askAgentWebview: Plugin = {
  name: "askAgent",
  inject: { required: ["editor", "commands", "document", "rpc", "menu"] },
  apply(ctx) {
    const ask = async () => {
      await ctx.document.flush();
      return ctx.rpc.call(protocol, "ask", {});
    };
    const askNow = () => {
      void ask().catch((error) =>
        ctx.logger.warn("Ask Agent about Selection failed", error),
      );
    };
    ctx.effect(() => ctx.commands.register("askAgentAboutSelection", ask));
    ctx.on("editor/selectionMenu", (items) => [
      ...items,
      { label: "Ask Agent about Selection", run: askNow },
    ]);
  },
};
