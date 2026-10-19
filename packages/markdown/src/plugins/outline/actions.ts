import type { Context } from "@workshop/core";
import type { HostSettings, TreeHandle } from "../../shared/host";
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
  // Captured while live: the reset runs after the context is disposed.
  const commands = ctx.hostCommands;
  const enabled = commands
    .execute("setContext", COMMANDS_CONTEXT, true)
    .catch((error) => ctx.logger.warn("Outline command context failed", error));
  ctx.effect(() => async () => {
    await enabled;
    await commands.execute("setContext", COMMANDS_CONTEXT, undefined);
  });
}

export function followsCursor(
  settings: HostSettings,
  resource?: string,
): boolean {
  const configured = settings.access.inspect(
    FOLLOW_CURSOR_SETTING,
    resource,
  ).value;
  return configured === undefined
    ? (settings.get(FOLLOW_CURSOR_SETTING, true) ?? true)
    : configured !== false;
}

export function registerOutlineActions(
  ctx: Context,
  view: OutlineView,
  tree: TreeHandle,
): void {
  ctx.effect(() =>
    ctx.hostCommands.register(EXPAND_ALL_COMMAND, () => view.expandAll()),
  );
  ctx.effect(() =>
    ctx.hostCommands.register(TOGGLE_COMMAND, async () => {
      if (tree.visible) {
        // VS Code resolves this view's current container after Move View.
        await ctx.hostCommands.execute(`${VIEW_ID}.removeView`);
      } else {
        await ctx.hostCommands.execute(`${VIEW_ID}.focus`);
      }
    }),
  );
  const setFollowCursor = async (enabled: boolean) => {
    await ctx.settings.access.update(
      FOLLOW_CURSOR_SETTING,
      enabled,
      ctx.editors.active()?.document.uri,
    );
    await updateFollowContext(ctx);
    await view.followCaret();
  };
  ctx.effect(() =>
    ctx.hostCommands.register(ENABLE_FOLLOW_COMMAND, () =>
      setFollowCursor(true),
    ),
  );
  ctx.effect(() =>
    ctx.hostCommands.register(DISABLE_FOLLOW_COMMAND, () =>
      setFollowCursor(false),
    ),
  );
}

export function registerFollowCursor(ctx: Context, view: OutlineView): void {
  // Captured while live: services may be withdrawn before effects are disposed.
  const commands = ctx.hostCommands;
  const update = () => {
    void updateFollowContext(ctx).catch((error) =>
      ctx.logger.warn("Outline follow setting failed", error),
    );
    void view.followCaret();
  };
  ctx.effect(() => ctx.settings.onChange(update));
  ctx.on("editor/activeChanged", update);
  ctx.on("editor/opened", update);
  ctx.on("editor/closed", update);
  ctx.effect(() => async () => {
    await commands.execute("setContext", FOLLOW_CURSOR_CONTEXT, undefined);
  });
  update();
}

async function updateFollowContext(ctx: Context): Promise<void> {
  await ctx.hostCommands.execute(
    "setContext",
    FOLLOW_CURSOR_CONTEXT,
    followsCursor(ctx.settings, ctx.editors.active()?.document.uri),
  );
}
