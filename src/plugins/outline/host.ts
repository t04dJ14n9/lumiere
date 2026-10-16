import * as vscode from "vscode";
import type { Context, Plugin } from "../../kernel";
import type { TreeHandle } from "../../shared/runtime";
import type {} from "../editor/api";
import type {} from "../vault/api";
import {
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
  inject: { required: ["workshop", "vaults", "editors"] },
  apply(ctx) {
    const workshop = ctx.workshop;
    const editors = ctx.editors;
    const views = workshop.views;
    if (!views) {
      return;
    }
    const source = new OutlineSource();
    const tree = views.tree(VIEW_ID, source, { showCollapseAll: true });
    ctx.effect(() => () => tree.dispose());
    const view = new OutlineView({
      source,
      tree,
      editors,
      logger: ctx.logger,
      followsCursor: () =>
        followsCursor(workshop, editors.active()?.document.uri),
    });
    ctx.effect(() => () => view.dispose());
    registerOutlineCommandContext(ctx);
    registerOutlineUpdates(ctx, view, tree);
    registerOutlineActions(ctx, view, tree);
    registerFollowCursor(ctx, view);
    registerSymbolPicker(ctx, views);
    registerOutlineFocus(ctx);
    ctx.effect(() =>
      views.command(OPEN_COMMAND, (uri, offset) =>
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
  const focus = createOutlineFocus({
    execute: (command) => ctx.workshop.execute(command),
    focusEditor: () =>
      ctx.workshop.execute("workbench.action.focusActiveEditorGroup"),
    activeCustomEditorViewType: activeCustomEditorViewType,
  });
  ctx.effect(() => () => focus.dispose());
  const sync = () => focus.sync(Boolean(ctx.editors.active()));
  ctx.on("editor/opened", sync);
  ctx.on("editor/closed", sync);
  ctx.on("editor/activeChanged", sync);
  // An already-active panel may not emit activeChanged at startup.
  sync();
}

function activeCustomEditorViewType(): string | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputCustom) {
    return input.viewType;
  }
  return undefined;
}
