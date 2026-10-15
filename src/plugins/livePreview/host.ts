import type { Plugin } from "../../kernel";
import { contributionId } from "../../shared/setting-schema";
import type {} from "../editor/api";
import { protocol } from "../commands/protocol";
export const livePreviewHost: Plugin = {
  name: "livePreview",
  inject: { required: ["workshop", "editors"] },
  apply(ctx) {
    ctx.effect(() =>
      ctx.workshop.command(contributionId("toggleSourceMode"), () =>
        ctx.editors
          .active()
          ?.rpc.call(protocol, "run", { command: "editor:toggle-source" }),
      ),
    );
  },
};
