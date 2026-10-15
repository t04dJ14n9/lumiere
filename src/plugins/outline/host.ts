import type { Context, Plugin } from "../../kernel";
import type { TreeHandle } from "../../shared/runtime";
import type {} from "../editor/api";
import type {} from "../vault/api";
import {
  followsCursor,
  registerFollowCursor,
  registerOutlineActions,
} from "./actions";
import { OPEN_COMMAND, VIEW_ID } from "./commands";
import { registerDocumentSymbols } from "./document-symbols";
import { OutlineSource } from "./tree";
import { OutlineView } from "./view";

/** The active panel's headings, with native expansion actions and optional following. */
export const outlineHost: Plugin = {
  name: "outline",
  inject: { required: ["workbench", "vaults", "editors"] },
  apply(ctx) {
    const workbench = ctx.workbench;
    const editors = ctx.editors;
    const views = workbench.views;
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
        followsCursor(workbench, editors.active()?.document.uri),
    });
    ctx.effect(() => () => view.dispose());
    registerOutlineUpdates(ctx, view, tree);
    registerOutlineActions(ctx, view, tree);
    registerFollowCursor(ctx, view);
    ctx.effect(() => {
      const registration = registerDocumentSymbols();
      return () => registration.dispose();
    });
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
