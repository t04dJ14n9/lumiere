import { keymap } from "@codemirror/view";
import { deleteLine, moveLineUp, moveLineDown } from "@codemirror/commands";
import { selectNextOccurrence } from "@codemirror/search";
import { EditorSelection } from "@codemirror/state";
import type { Command } from "@codemirror/view";
import type { EditorState, TransactionSpec } from "@codemirror/state";
import type { Context, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../commands/api";
import type {} from "./api";
import { toggleComment } from "./comment";
import { clearInlineFormatting, wrapSelection } from "./inline";
import { fenceLines, lineEdit, linkEdit, ruleEdit, tagEdit } from "./lines";
import { addCursor } from "./cursors";
import { linkPasteHandler } from "./paste-link";

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
    ctx.effect(() => ctx.editor.extend(linkPasteHandler));
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
  ]) {
    commands.set(`editor:toggle-${id}`, wrapSelection(marker!));
  }
  commands.set("editor:toggle-comments", (view) => {
    if (view.state.readOnly) {
      return false;
    }
    view.dispatch(toggleComment(view.state));
    return true;
  });
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
    view.dispatch(ruleEdit(view.state));
    return true;
  });
  commands.set("editor:swap-line-up", moveLineUp);
  commands.set("editor:swap-line-down", moveLineDown);
  addEditingCommands(commands);
  return commands;
}

/** Obsidian's other editing commands, measured against Obsidian. */
function addEditingCommands(commands: Map<string, Command>): void {
  const edit =
    (make: (state: EditorState) => TransactionSpec): Command =>
    (view) => {
      if (view.state.readOnly) {
        return false;
      }
      view.dispatch(make(view.state));
      return true;
    };
  commands.set(
    "editor:insert-codeblock",
    edit((s) => fenceLines(s, "```", "```")),
  );
  commands.set("editor:insert-tag", edit(tagEdit));
  // Obsidian's Delete paragraph is CodeMirror's delete-line command.
  commands.set("editor:delete-paragraph", deleteLine);
  commands.set("editor:add-cursor-above", addCursor(false));
  commands.set("editor:add-cursor-below", addCursor(true));
  // Clear formatting acts on a selection; a caret alone changes nothing.
  commands.set("editor:clear-formatting", (view) => {
    if (
      view.state.readOnly ||
      view.state.selection.ranges.every((r) => r.empty)
    ) {
      return false;
    }
    view.dispatch({
      ...view.state.changeByRange((range) => {
        if (range.empty) {
          return { range };
        }
        const { from, to } = withMarkersAround(view.state, range);
        const cleared = clearInlineFormatting(view.state.sliceDoc(from, to));
        return {
          changes: { from, to, insert: cleared },
          range: EditorSelection.range(from, from + cleared.length),
        };
      }),
      userEvent: "input",
    });
    return true;
  });
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
        {
          key: "Mod-/",
          run: commands.get("editor:toggle-comments")!,
          stopPropagation: true,
        },
        // VS Code's keys for more carets: Obsidian binds none.
        {
          key: "Mod-Alt-ArrowUp",
          run: commands.get("editor:add-cursor-above")!,
          stopPropagation: true,
        },
        {
          key: "Mod-Alt-ArrowDown",
          run: commands.get("editor:add-cursor-below")!,
          stopPropagation: true,
        },
        { key: "Mod-d", run: selectNextOccurrence, stopPropagation: true },
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

const MARKERS = ["**", "__", "~~", "==", "*", "_", "`", "$"];

/**
 * The selection with any formatting markers right around it, as Obsidian's
 * Clear Formatting takes them: `a **‹b›** c` clears to `a ‹b› c`.
 */
function withMarkersAround(
  state: EditorState,
  range: { from: number; to: number },
): { from: number; to: number } {
  let { from, to } = range;
  for (let widened = true; widened;) {
    widened = false;
    for (const marker of MARKERS) {
      const size = marker.length;
      if (
        from >= size &&
        to + size <= state.doc.length &&
        state.sliceDoc(from - size, from) === marker &&
        state.sliceDoc(to, to + size) === marker
      ) {
        from -= size;
        to += size;
        widened = true;
        break;
      }
    }
  }
  return { from, to };
}
