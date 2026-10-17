import { keymap } from "@codemirror/view";
import { moveLineUp, moveLineDown } from "@codemirror/commands";
import type { Command } from "@codemirror/view";
import type { Context, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "./api";
import { clearInlineFormatting, wrapSelection } from "./inline";
import { lineEdit, linkEdit } from "./lines";

export const formattingWebview: Plugin = {
  name: "formatting",
  inject: { required: ["editor", "commands"] },
  provides: ["formatting"],
  apply(ctx) {
    ctx.provide("formatting", {
      wrap: (marker, view) => wrapSelection(marker)(view),
      clear: clearInlineFormatting,
    });
    const commands = formattingCommands();
    registerFormattingCommands(ctx, commands);
    registerFormattingKeys(ctx, commands);
  },
};

function formattingCommands(): Map<string, Command> {
  const commands = new Map<string, Command>();
  for (const [id, marker] of [
    ["bold", "**"],
    ["italics", "*"],
    ["strikethrough", "~~"],
    ["highlight", "=="],
    ["code", "`"],
    ["comments", "%%"],
  ]) {
    commands.set(`editor:toggle-${id}`, wrapSelection(marker!));
  }
  addLineCommands(commands);
  commands.set("editor:insert-link", (view) => {
    if (view.state.readOnly) {
      return false;
    }
    view.dispatch(linkEdit(view.state));
    return true;
  });
  commands.set("editor:insert-horizontal-rule", (view) => {
    if (view.state.readOnly) {
      return false;
    }
    view.dispatch({
      ...view.state.replaceSelection("\n\n---\n\n"),
      userEvent: "input",
    });
    return true;
  });
  commands.set("editor:swap-line-up", moveLineUp);
  commands.set("editor:swap-line-down", moveLineDown);
  return commands;
}

function registerFormattingCommands(
  ctx: Context,
  commands: Map<string, Command>,
): void {
  for (const [id, run] of commands) {
    ctx.effect(() =>
      ctx.commands.register(id, () =>
        run(ctx.bail("editor/activeView") ?? ctx.editor.view),
      ),
    );
  }
}

function registerFormattingKeys(
  ctx: Context,
  commands: Map<string, Command>,
): void {
  ctx.effect(() =>
    ctx.editor.extend(
      keymap.of([
        // VS Code forwards webview keystrokes that reach the window to its
        // keybinding service, which would run the contributed Ctrl+B/I/K
        // binding a second time (or Cursor's Ctrl+I agent). Stopping
        // propagation keeps each shortcut in this one place.
        {
          key: "Mod-b",
          run: commands.get("editor:toggle-bold")!,
          stopPropagation: true,
        },
        {
          key: "Mod-i",
          run: commands.get("editor:toggle-italics")!,
          stopPropagation: true,
        },
        {
          key: "Mod-k",
          run: commands.get("editor:insert-link")!,
          stopPropagation: true,
        },
      ]),
    ),
  );
}

function addLineCommands(commands: Map<string, Command>): void {
  for (const [id, prefix] of [
    ["toggle-bullet-list", "- "],
    ["toggle-numbered-list", "1. "],
    ["toggle-blockquote", "> "],
    ...Array.from({ length: 7 }, (_, level) => [
      `set-heading-${level}`,
      level ? "#".repeat(level) + " " : "",
    ]),
  ]) {
    commands.set(`editor:${id}`, (view) => {
      if (view.state.readOnly) {
        return false;
      }
      view.dispatch(lineEdit(view.state, prefix!));
      return true;
    });
  }
}
