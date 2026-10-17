import type { Plugin } from "@workshop/core";
import type { PanelShell } from "../../shared/runtime";
import type {} from "../resources/api";
import { protocol } from "./protocol";
import { taskEdit } from "./edits";
export const tasksHost: Plugin<{ panel: PanelShell }> = {
  name: "tasks",
  inject: { required: ["workshop", "rpc", "resources"] },
  apply(ctx, { panel }) {
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "toggle", async (request) => {
        const source = request.source ?? panel.document.uri;
        if (!ctx.resources.authorize) {
          throw new Error("Resource authorization unavailable");
        }
        await ctx.resources.authorize(source);
        const document =
          source === panel.document.uri
            ? panel.document
            : await ctx.workshop.openDocument?.(source);
        if (!document) {
          throw new Error("Document unavailable");
        }
        const change = taskEdit(
          document.getText().replace(/\r\n/g, "\n"),
          request.line,
          request.expected,
          request.checked,
        );
        return change ? ctx.workshop.apply(document, [change]) : false;
      }),
    );
  },
};
