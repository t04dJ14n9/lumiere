import type { Plugin } from "@workshop/core";
import type {} from "./api";
import { protocol } from "./protocol";
export const resourcesWebview: Plugin = {
  name: "resources",
  inject: { required: ["rpc"] },
  provides: ["resources"],
  apply(ctx) {
    ctx.provide("resources", {
      load: (target, source, syntax) =>
        ctx.rpc.call(protocol, "load", {
          target,
          ...(source === undefined ? {} : { source }),
          ...(syntax === undefined ? {} : { syntax }),
        }),
    });
  },
};
