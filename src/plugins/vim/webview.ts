import {
  CodeMirror,
  Vim,
  getCM,
  vim,
  type CodeMirrorV,
} from "@replit/codemirror-vim";
import { EditorView } from "@codemirror/view";
import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "./api";
import type {} from "../commands/api";

/** Each webview has one editor; restore the library hooks when its fiber stops. */
export const vimWebview: Plugin = {
  name: "vim",
  inject: { required: ["editor", "commands"] },
  apply(ctx) {
    ctx.provide("vim", {
      mode: (view) => getCM(view)?.state.vim ?? undefined,
      extension: () => vim({ status: false }),
      sync(from, to) {
        const source = getCM(from)?.state.vim;
        const target = getCM(to);
        if (
          !source ||
          !target?.state.vim ||
          source.insertMode === target.state.vim.insertMode
        ) {
          return;
        }
        const selection = to.state.selection;
        if (source.insertMode) {
          Vim.handleKey(target, "i", "api");
        } else {
          Vim.exitInsertMode(target as CodeMirrorV, true);
        }
        if (!selection.eq(to.state.selection)) {
          to.dispatch({ selection });
        }
      },
    });
    ctx.effect(() =>
      ctx.commands.register("vim:consume-host-shortcut", () => true),
    );
    const action = (name: string) => {
      void ctx.commands.run(name);
    };
    for (const name of ["undo", "redo", "save"] as const) {
      ctx.effect(() => {
        const previous = CodeMirror.commands[name];
        CodeMirror.commands[name] = () => action(name);
        return () => {
          CodeMirror.commands[name] = previous;
        };
      });
    }
    // codemirror-vim has no public removeEx API. The closures are deactivated
    // on stop so disabled fibers cannot act through a lingering library entry.
    let live = true;
    ctx.effect(() => () => {
      live = false;
    });
    for (const [name, short, command] of [
      ["write", "w", "save"],
      ["quit", "q", "close"],
      ["wq", "wq", "saveClose"],
      ["x", "x", "saveClose"],
      ["undo", "u", "undo"],
      ["redo", "red", "redo"],
    ] as const) {
      ctx.effect(() => {
        Vim.defineEx(name, short, () => {
          if (live) {
            action(command);
          }
        });
        return () => {};
      });
    }
    ctx.effect(() =>
      ctx.editor.extend(
        [
          vim({ status: true }),
          EditorView.domEventHandlers({
            beforeinput(event, view) {
              const mode = getCM(view)?.state.vim;
              if (
                mode &&
                !mode.insertMode &&
                ["insertText", "insertCompositionText"].includes(
                  event.inputType,
                ) &&
                event.target === view.contentDOM
              ) {
                event.preventDefault();
                return true;
              }
              return false;
            },
          }),
        ],
        { slot: "override" },
      ),
    );
  },
};
