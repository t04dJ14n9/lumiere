import type { Plugin } from "@workshop/core";
import { contributionId } from "../../shared/setting-schema";
import type {} from "../editor/api";
import { protocol } from "../commands/protocol";
export const livePreviewHost: Plugin = {
  name: "livePreview",
  inject: { required: ["hostCommands", "editors"] },
  apply(ctx) {
    ctx.effect(() =>
      ctx.hostCommands.register(contributionId("toggleSourceMode"), () =>
        ctx.editors
          .active()
          ?.rpc.call(protocol, "run", { command: "editor:toggle-source" }),
      ),
    );
  },
};
