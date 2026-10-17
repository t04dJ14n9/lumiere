import type { Plugin } from "@workshop/core";
/** Window half: native text-editor links remain available before any custom pane opens. */
export const nativeLinksHost: Plugin = {
  name: "links",
  inject: { required: ["workshop"] },
  apply(ctx) {
    if (ctx.workshop.registerNativeLinks) {
      ctx.effect(() => ctx.workshop.registerNativeLinks!());
    }
  },
};
