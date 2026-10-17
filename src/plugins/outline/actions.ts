import type { Context } from "@workshop/core";
import type { TreeHandle, Workshop } from "../../shared/runtime";
import {
  COMMANDS_CONTEXT,
  DISABLE_FOLLOW_COMMAND,
  ENABLE_FOLLOW_COMMAND,
  EXPAND_ALL_COMMAND,
  FOLLOW_CURSOR_CONTEXT,
  FOLLOW_CURSOR_SETTING,
  TOGGLE_COMMAND,
  VIEW_ID,
} from "./commands";
import type { OutlineView } from "./view";

export function registerOutlineCommandContext(ctx: Context): void {
  // The editor populates contexts for panel plugins only. Outline runs once
  // per window, so its own lifetime controls the generated command guards.
  const workshop = ctx.workshop;
  const enabled = workshop
    .execute("setContext", COMMANDS_CONTEXT, true)
    .catch((error) => ctx.logger.warn("Outline command context failed", error));
  ctx.effect(() => async () => {
    await enabled;
    await workshop.execute("setContext", COMMANDS_CONTEXT, undefined);
  });
}

export function followsCursor(workshop: Workshop, resource?: string): boolean {
  const configured = workshop.settings?.inspect(
    FOLLOW_CURSOR_SETTING,
    resource,
  ).value;
  return configured === undefined
    ? (workshop.views?.setting(FOLLOW_CURSOR_SETTING, true) ?? true)
    : configured !== false;
}

export function registerOutlineActions(
  ctx: Context,
  view: OutlineView,
  tree: TreeHandle,
): void {
  ctx.effect(() =>
    ctx.workshop.command(EXPAND_ALL_COMMAND, () => view.expandAll()),
  );
  ctx.effect(() =>
    ctx.workshop.command(TOGGLE_COMMAND, async () => {
      if (tree.visible) {
        // VS Code resolves this view's current container after Move View.
        await ctx.workshop.execute(`${VIEW_ID}.removeView`);
      } else {
        await ctx.workshop.execute(`${VIEW_ID}.focus`);
      }
    }),
  );
  const setFollowCursor = async (enabled: boolean) => {
    const settings = ctx.workshop.settings;
    if (!settings) {
      return;
    }
    await settings.update(
      FOLLOW_CURSOR_SETTING,
      enabled,
      ctx.editors.active()?.document.uri,
    );
    await updateFollowContext(ctx);
    await view.followCaret();
  };
  ctx.effect(() =>
    ctx.workshop.command(ENABLE_FOLLOW_COMMAND, () => setFollowCursor(true)),
  );
  ctx.effect(() =>
    ctx.workshop.command(DISABLE_FOLLOW_COMMAND, () => setFollowCursor(false)),
  );
}

export function registerFollowCursor(ctx: Context, view: OutlineView): void {
  const workshop = ctx.workshop;
  const update = () => {
    void updateFollowContext(ctx).catch((error) =>
      ctx.logger.warn("Outline follow setting failed", error),
    );
    void view.followCaret();
  };
  const onConfiguration = ctx.workshop.onConfiguration;
  if (onConfiguration) {
    ctx.effect(() => onConfiguration(update));
  }
  ctx.on("editor/activeChanged", update);
  ctx.on("editor/opened", update);
  ctx.on("editor/closed", update);
  // Services may have been withdrawn before plugin effects are disposed.
  ctx.effect(() => async () => {
    await workshop.execute("setContext", FOLLOW_CURSOR_CONTEXT, undefined);
  });
  update();
}

async function updateFollowContext(ctx: Context): Promise<void> {
  await ctx.workshop.execute(
    "setContext",
    FOLLOW_CURSOR_CONTEXT,
    followsCursor(ctx.workshop, ctx.editors.active()?.document.uri),
  );
}
