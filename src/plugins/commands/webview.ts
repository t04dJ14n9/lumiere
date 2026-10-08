import { keymap } from "@codemirror/view";
import type { Plugin } from "../../kernel";
import { protocol } from "./protocol";
import type { Commands } from "./api";
import type {} from "../document/api";
import type {} from "../editor/api";
export const commandsWebview: Plugin = {
  name: "commands",
  inject: { required: ["rpc", "editor", "document"] },
  apply(ctx) {
    const handlers = new Map<string, () => boolean | Promise<boolean>>();
    const commands: Commands = {
      register(id, run) {
        if (handlers.has(id)) {
          throw new Error(`Duplicate command ${id}`);
        }
        handlers.set(id, run);
        return () => {
          handlers.delete(id);
        };
      },
      async run(id) {
        return (await handlers.get(id)?.()) ?? false;
      },
    };
    ctx.provide("commands", commands);
    type Action =
      | "save"
      | "undo"
      | "redo"
      | "close"
      | "saveClose"
      | "openAsText";
    const host = async (action: Action) => {
      await ctx.document.flush();
      return ctx.rpc.call(protocol, "action", { action });
    };
    const trigger = (action: Action): boolean => {
      void host(action).catch((error) =>
        ctx.logger.error("Command failed", error),
      );
      return true;
    };
    for (const action of [
      "save",
      "undo",
      "redo",
      "close",
      "saveClose",
      "openAsText",
    ] as const) {
      ctx.effect(() => commands.register(action, () => host(action)));
    }
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "run", ({ command }) => commands.run(command)),
    );
    ctx.effect(() =>
      ctx.editor.extend(
        keymap.of([
          { key: "Mod-s", run: () => trigger("save"), preventDefault: true },
          { key: "Mod-z", run: () => trigger("undo"), preventDefault: true },
          {
            key: "Mod-Shift-z",
            run: () => trigger("redo"),
            preventDefault: true,
          },
          { key: "Mod-y", run: () => trigger("redo"), preventDefault: true },
        ]),
        { slot: "override" },
      ),
    );
  },
};
