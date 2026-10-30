import type { Context, Plugin } from "@workshop/core";
import type { TreeHandle } from "../../shared/host";
import type {} from "../editor/api";
import type {} from "../vault/api";
import {
  expandMode,
  followsCursor,
  registerFollowCursor,
  registerOutlineActions,
  registerOutlineCommandContext,
} from "./actions";
import { OPEN_COMMAND, VIEW_ID } from "./commands";
import { createOutlineFocus } from "./focus";
import { registerSymbolPicker } from "./symbol-picker";
import { OutlineSource } from "./tree";
import { OutlineView } from "./view";

/** The active panel's headings, with native expansion actions and optional following. */
export const outlineHost: Plugin = {
  name: "outline",
  inject: {
    required: [
      "hostCommands",
      "settings",
      "vaults",
      "editors",
      "views",
      "dialogs",
      "activeEditor",
    ],
  },
  apply(ctx) {
    const editors = ctx.editors;
    const source = new OutlineSource();
    const tree = ctx.views.tree(VIEW_ID, source, { showCollapseAll: true });
    ctx.effect(() => () => tree.dispose());
    const view = new OutlineView({
      source,
      tree,
      editors,
      logger: ctx.logger,
      followsCursor: () =>
        followsCursor(ctx.settings, editors.active()?.document.uri),
      expandMode: () =>
        expandMode(ctx.settings, editors.active()?.document.uri),
    });
    ctx.effect(() => () => view.dispose());
    registerOutlineCommandContext(ctx);
    registerOutlineUpdates(ctx, view, tree);
    registerOutlineActions(ctx, view, tree);
    registerFollowCursor(ctx, view);
    registerSymbolPicker(ctx, ctx.dialogs);
    registerOutlineFocus(ctx);
    ctx.effect(() =>
      ctx.hostCommands.register(OPEN_COMMAND, (uri, offset) =>
        ctx.vaults.open(String(uri), { offset: Number(offset) }),
      ),
    );
    view.refresh();
  },
};

function registerOutlineUpdates(
  ctx: Context,
  view: OutlineView,
  tree: TreeHandle,
): void {
  // An editor opened already active may not emit activeChanged.
  ctx.on("editor/opened", () => view.refresh());
  ctx.on("editor/closed", () => view.refresh());
  ctx.on("editor/activeChanged", () => view.refresh());
  ctx.on("editor/ready", () => view.refresh());
  ctx.on("document/changed", (session) => {
    if (session.document.uri === ctx.editors.active()?.document.uri) {
      view.schedule();
    }
  });
  ctx.on("editor/selectionChanged", (panel) => {
    if (panel === ctx.editors.active()) {
      void view.followCaret();
    }
  });
  ctx.effect(() =>
    tree.onVisibilityChanged((visible) => {
      if (visible) {
        view.refresh();
      }
    }),
  );
}

function registerOutlineFocus(ctx: Context): void {
  // Captured while live: the focus check can run after the plugin stops.
  const activeEditor = ctx.activeEditor;
  const focus = createOutlineFocus({
    execute: (command) => ctx.hostCommands.execute(command),
    focusEditor: () =>
      ctx.hostCommands.execute("workbench.action.focusActiveEditorGroup"),
    activeCustomEditorViewType: () => activeEditor.customEditorViewType(),
  });
  ctx.effect(() => () => focus.dispose());
  const sync = () => {
    const active = ctx.editors.active();
    focus.sync(Boolean(active && !active.openedFromNativeSelection));
  };
  ctx.on("editor/opened", sync);
  ctx.on("editor/closed", sync);
  ctx.on("editor/activeChanged", sync);
  // An already-active panel may not emit activeChanged at startup.
  sync();
}
