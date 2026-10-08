import type { Plugin } from "../../kernel";
import type {} from "./api";
import { protocol } from "./protocol";
export const resourcesWebview: Plugin = {
  name: "resources",
  inject: { required: ["rpc"] },
  apply(ctx) {
    ctx.provide("resources", {
      load: (target, source) => ctx.rpc.call(protocol, "load", { target, source }),
    });
  },
};
