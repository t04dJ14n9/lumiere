import { keymap } from "@codemirror/view";
import type { Context, Plugin } from "../../kernel";
import { protocol } from "./protocol";
import type { Commands } from "./api";
import { createCommands } from "./registry";
import { keepHistoryKeysInEditor } from "./history-keys";
import type {} from "../document/api";
import type {} from "../editor/api";
export const commandsWebview: Plugin = {
  name: "commands",
  inject: { required: ["rpc", "editor", "document"] },
  apply(ctx) {
    const commands = createCommands();
    ctx.provide("commands", commands);
    const host = (action: Action) => hostAction(ctx, action);
    registerHostActions(ctx, commands, host);
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "run", ({ command }) => commands.run(command)),
    );
    registerHostKeys(ctx, host);
    registerHistoryKeys(ctx, host);
  },
};

type Action = "save" | "undo" | "redo" | "close" | "saveClose" | "openAsText";

async function hostAction(ctx: Context, action: Action): Promise<boolean> {
  await ctx.document.flush();
  return ctx.rpc.call(protocol, "action", { action });
}

function registerHostActions(
  ctx: Context,
  commands: Commands,
  host: (action: Action) => Promise<boolean>,
): void {
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
}

function trigger(
  ctx: Context,
  host: (action: Action) => Promise<boolean>,
  action: Action,
): boolean {
  void host(action).catch((error) => ctx.logger.error("Command failed", error));
  return true;
}

function registerHostKeys(
  ctx: Context,
  host: (action: Action) => Promise<boolean>,
): void {
  // Save stays on the CodeMirror keymap (with stopPropagation so VS Code's
  // webview forwarder does not run a second Save). Undo/redo are owned in
  // capture phase by registerHistoryKeys: the shell always preventDefaults and
  // forwards those keys, which raced with a bubble-only guard.
  ctx.effect(() =>
    ctx.editor.extend(
      keymap.of([
        {
          key: "Mod-s",
          run: () => trigger(ctx, host, "save"),
          preventDefault: true,
          stopPropagation: true,
        },
      ]),
      { slot: "override" },
    ),
  );
}

function registerHistoryKeys(
  ctx: Context,
  host: (action: Action) => Promise<boolean>,
): void {
  ctx.effect(() =>
    keepHistoryKeysInEditor(ctx.editor.view.dom.ownerDocument, (action) => {
      trigger(ctx, host, action);
    }),
  );
}
