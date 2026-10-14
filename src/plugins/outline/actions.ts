import type { Context } from "../../kernel";
import type { Workbench } from "../../shared/runtime";
import {
  DISABLE_FOLLOW_COMMAND,
  ENABLE_FOLLOW_COMMAND,
  EXPAND_ALL_COMMAND,
  FOLLOW_CURSOR_CONTEXT,
  FOLLOW_CURSOR_SETTING,
} from "./commands";
import type { OutlineView } from "./view";

export function followsCursor(
  workbench: Workbench,
  resource?: string,
): boolean {
  const configured = workbench.settings?.inspect(
    FOLLOW_CURSOR_SETTING,
    resource,
  ).value;
  return configured === undefined
    ? (workbench.views?.setting(FOLLOW_CURSOR_SETTING, true) ?? true)
    : configured !== false;
}

export function registerOutlineActions(ctx: Context, view: OutlineView): void {
  ctx.effect(() =>
    ctx.workbench.command(EXPAND_ALL_COMMAND, () => view.expandAll()),
  );
  const setFollowCursor = async (enabled: boolean) => {
    const settings = ctx.workbench.settings;
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
    ctx.workbench.command(ENABLE_FOLLOW_COMMAND, () => setFollowCursor(true)),
  );
  ctx.effect(() =>
    ctx.workbench.command(DISABLE_FOLLOW_COMMAND, () => setFollowCursor(false)),
  );
}

export function registerFollowCursor(ctx: Context, view: OutlineView): void {
  const workbench = ctx.workbench;
  const update = () => {
    void updateFollowContext(ctx).catch((error) =>
      ctx.logger.warn("Outline follow setting failed", error),
    );
    void view.followCaret();
  };
  const onConfiguration = ctx.workbench.onConfiguration;
  if (onConfiguration) {
    ctx.effect(() => onConfiguration(update));
  }
  ctx.on("editor/activeChanged", update);
  ctx.on("editor/opened", update);
  ctx.on("editor/closed", update);
  // Services may have been withdrawn before plugin effects are disposed.
  ctx.effect(() => async () => {
    await workbench.execute("setContext", FOLLOW_CURSOR_CONTEXT, undefined);
  });
  update();
}

async function updateFollowContext(ctx: Context): Promise<void> {
  await ctx.workbench.execute(
    "setContext",
    FOLLOW_CURSOR_CONTEXT,
    followsCursor(ctx.workbench, ctx.editors.active()?.document.uri),
  );
}
