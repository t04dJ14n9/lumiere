import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
import { protocol } from "../commands/protocol";
export const livePreviewHost: Plugin = {
  name: "livePreview",
  inject: { required: ["workbench", "editors"] },
  apply(ctx) {
    ctx.effect(() =>
      ctx.workbench.command("markdownWorkbench.toggleSourceMode", () =>
        ctx.editors.active()?.rpc.call(protocol, "run", { command: "editor:toggle-source" }),
      ),
    );
  },
};
