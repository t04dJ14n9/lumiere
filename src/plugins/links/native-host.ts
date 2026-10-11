import type { Plugin } from "../../kernel";
/** Window half: native text-editor links remain available before any custom pane opens. */
export const nativeLinksHost: Plugin = {
  name: "links",
  inject: { required: ["workbench"] },
  apply(ctx) {
    if (ctx.workbench.registerNativeLinks) {
      ctx.effect(() => ctx.workbench.registerNativeLinks!());
    }
  },
};
