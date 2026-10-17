import type { Plugin } from "@workshop/core";
/** Window half: native text-editor links remain available before any custom pane opens. */
export const nativeLinksHost: Plugin = {
  name: "links",
  inject: { required: ["dialogs", "settings", "navigation"] },
  apply(ctx) {
    if (ctx.navigation.registerNativeLinks) {
      ctx.effect(() => ctx.navigation.registerNativeLinks!());
    }
  },
};
