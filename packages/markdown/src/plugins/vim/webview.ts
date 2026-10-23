import {
  CodeMirror,
  Vim,
  getCM,
  vim,
  type CodeMirrorV,
} from "@replit/codemirror-vim";
import { EditorView } from "@codemirror/view";
import type { Context, Infer, Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "./api";
import type {} from "../commands/api";
import { vimCaretMode } from "./caret";
import { config } from "./manifest";
import { revealBlockMotion } from "./motion";
import { freezeRevealDuringVisual } from "./visual-reveal";
import { normalCaretAfterHostEdits } from "./normal-caret";
import { installVimKeyRouting } from "./key-routing";
import { vimLineKeyboard } from "./keyboard";
import { insertIntoClickedSource } from "./click-insert";
import type {} from "../livePreview/api";

/** Live caret profile for the panel; reconfigure updates without remounting Vim. */
const caretProfiles = new WeakMap<
  Context,
  { profile: Infer<typeof config>["caretStyle"] }
>();

/** Each webview has one editor; restore the library hooks when its fiber stops. */
export const vimWebview: Plugin<Infer<typeof config>> = {
  name: "vim",
  inject: { required: ["editor", "commands"], optional: ["livePreview"] },
  provides: ["vim"],
  config,
  reconfigure(ctx, options) {
    const slot = caretProfiles.get(ctx);
    if (!slot) {
      return false;
    }
    slot.profile = options.caretStyle;
    // Refresh the caret layer (profile is read on the next appearance pass).
    ctx.editor.view.dispatch({});
    return true;
  },
  apply(ctx, options) {
    caretProfiles.set(ctx, { profile: options.caretStyle });
    ctx.effect(() => () => {
      caretProfiles.delete(ctx);
    });
    registerVimService(ctx);
    registerShortcutConsumer(ctx);
    registerNativeActions(ctx);
    registerExCommands(ctx);
    registerVimExtension(ctx);
    // BH-021: default <C-p>→k steals Quick Open and races suggest Ctrl+P.
    releaseQuickOpenFromVim(ctx);
    // BH-029: default <C-a> increment steals Select All.
    releaseSelectAllFromVim(ctx);
    // BH-046: vim-core has foldCode but no za/zc/zo maps; wire Obsidian folds.
    installVimFoldKeys(ctx);
  },
};

function registerVimService(ctx: Context): void {
  const routing = installVimKeyRouting();
  ctx.effect(() => () => routing.destroy());
  ctx.provide("vim", {
    handoff(from, to) {
      const source = getCM(from);
      const target = getCM(to);
      return source && target ? routing.handoff(source, target) : () => {};
    },
    mode: (view) => getCM(view)?.state.vim ?? undefined,
    watchMode(view, changed) {
      const cm = getCM(view);
      cm?.on("vim-mode-change", changed);
      return () => cm?.off("vim-mode-change", changed);
    },
    extension: () => vimExtensions(ctx, false),
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
}

function registerShortcutConsumer(ctx: Context): void {
  ctx.effect(() =>
    ctx.commands.register("vim:consume-host-shortcut", () => true),
  );
  // BH-034: host keybinding blocks files.newUntitledFile; replay <C-n> so
  // vim-core's keyToKey → j (and insert-mode completion) still run.
  ctx.effect(() =>
    ctx.commands.register("vim:handle-ctrl-n", () => {
      const cm = getCM(ctx.editor.view);
      if (cm) {
        Vim.handleKey(cm, "<C-n>", "api");
      }
      return true;
    }),
  );
}

function registerNativeActions(ctx: Context): void {
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
}

function registerExCommands(ctx: Context): void {
  const action = (name: string) => {
    void ctx.commands.run(name);
  };
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
}

function registerVimExtension(ctx: Context): void {
  ctx.effect(() =>
    ctx.editor.extend(
      [
        vimExtensions(ctx, true),
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
}

function vimExtensions(ctx: Context, status: boolean) {
  return [
    vim({ status }),
    vimLineKeyboard,
    insertIntoClickedSource,
    revealBlockMotion(ctx.livePreview),
    freezeRevealDuringVisual(),
    normalCaretAfterHostEdits,
    ctx.editor.caret({
      mode: (view) => {
        const cm = getCM(view);
        return vimCaretMode(cm?.state, Boolean(cm?.state.dialog));
      },
      profile: () => caretProfiles.get(ctx)?.profile ?? "obsidian",
      watch(view, refresh) {
        const cm = getCM(view);
        if (!cm) {
          return () => {};
        }
        // A pending operator emits a keypress without a selection or mode
        // transaction; the search and ex prompts signal `dialog`.
        const events = [
          "vim-mode-change",
          "vim-keypress",
          "vim-command-done",
          "dialog",
        ];
        for (const event of events) {
          cm.on(event, refresh);
        }
        return () => {
          for (const event of events) {
            cm.off(event, refresh);
          }
        };
      },
    }),
  ];
}

/** BH-046: map za/zc/zo/zM/zR onto Lumière fold commands (gutter/Toggle Fold already work). */
function installVimFoldKeys(ctx: Context): void {
  ctx.effect(() => {
    const run = (id: string) => {
      void ctx.commands.run(id);
    };
    Vim.defineAction("lumiereToggleFold", () => {
      run("editor:toggle-fold");
    });
    Vim.defineAction("lumiereFoldMore", () => {
      run("editor:fold-more");
    });
    Vim.defineAction("lumiereFoldLess", () => {
      run("editor:fold-less");
    });
    Vim.defineAction("lumiereFoldAll", () => {
      run("editor:fold-all");
    });
    Vim.defineAction("lumiereUnfoldAll", () => {
      run("editor:unfold-all");
    });
    const maps: readonly (readonly [string, string])[] = [
      ["za", "lumiereToggleFold"],
      ["zc", "lumiereFoldMore"],
      ["zo", "lumiereFoldLess"],
      ["zM", "lumiereFoldAll"],
      ["zR", "lumiereUnfoldAll"],
    ];
    for (const [keys, name] of maps) {
      Vim.mapCommand(keys, "action", name, {}, {});
    }
    return () => {
      const anyMode = undefined as unknown as string;
      for (const [keys] of maps) {
        Vim.unmap(keys, anyMode);
      }
    };
  });
}

/** Drop vim-core's <C-p>→k so host Quick Open / suggest Ctrl+P can run (BH-021). */
function releaseQuickOpenFromVim(ctx: Context): void {
  ctx.effect(() => {
    // Default <C-p>→k has no mode context; typings require a string.
    const anyMode = undefined as unknown as string;
    Vim.unmap("<C-p>", anyMode);
    return () => {
      // Restore the library default when this vim fiber stops.
      Vim.map("<C-p>", "k", anyMode);
    };
  });
}

/** Drop vim-core's <C-a> increment so Select All can run (BH-029). */
function releaseSelectAllFromVim(ctx: Context): void {
  ctx.effect(() => {
    const anyMode = undefined as unknown as string;
    Vim.unmap("<C-a>", anyMode);
    return () => {
      // Library default is an action map, not keyToKey; re-map via Ex.
      Vim.mapCommand(
        "<C-a>",
        "action",
        "incrementNumberToken",
        { increase: true, backtrack: false },
        { isEdit: true },
      );
    };
  });
}
