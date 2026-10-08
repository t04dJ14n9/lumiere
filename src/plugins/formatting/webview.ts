import { keymap } from "@codemirror/view";
import { moveLineUp, moveLineDown } from "@codemirror/commands";
import type { Command } from "@codemirror/view";
import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "./api";
import { clearInlineFormatting, wrapSelection } from "./inline";
import { lineEdit, linkEdit } from "./lines";

export const formattingWebview: Plugin = {
  name: "formatting",
  inject: { required: ["editor", "commands"] },
  apply(ctx) {
    ctx.provide("formatting", {
      wrap: (marker, view) => wrapSelection(marker)(view),
      clear: clearInlineFormatting,
    });
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
        if (view.state.readOnly) return false;
        view.dispatch(lineEdit(view.state, prefix!));
        return true;
      });
    }
    commands.set("editor:insert-link", (view) => {
      if (view.state.readOnly) return false;
      view.dispatch(linkEdit(view.state));
      return true;
    });
    commands.set("editor:insert-horizontal-rule", (view) => {
      if (view.state.readOnly) return false;
      view.dispatch({
        ...view.state.replaceSelection("\n\n---\n\n"),
        userEvent: "input",
      });
      return true;
    });
    commands.set("editor:swap-line-up", moveLineUp);
    commands.set("editor:swap-line-down", moveLineDown);
    for (const [id, run] of commands)
      ctx.effect(() =>
        ctx.commands.register(id, () =>
          run(ctx.bail("editor/activeView") ?? ctx.editor.view),
        ),
      );
    ctx.effect(() =>
      ctx.editor.extend(
        keymap.of([
          { key: "Mod-b", run: commands.get("editor:toggle-bold")! },
          { key: "Mod-i", run: commands.get("editor:toggle-italics")! },
          { key: "Mod-k", run: commands.get("editor:insert-link")! },
        ]),
      ),
    );
  },
};
