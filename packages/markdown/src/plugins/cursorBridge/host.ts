import type { Context, Plugin } from "@workshop/core";
import type { HostDocument } from "../../shared/host";
import type {} from "../editor/api";
import { isCursorHost, openCursorChat, openCursorEdit } from "./cursor";
import {
  confirmActiveEditor,
  handOffSelection,
  type HandoffSurface,
} from "./handoff";
import { contributionId } from "../../shared/setting-schema";
import { captureActiveSelection } from "./selection";

const IS_CURSOR_HOST = contributionId("isCursorHost");

export interface CursorBridgeConfig {
  readonly appName: string;
  readonly surface: HandoffSurface;
}

/** Host half: Cursor Chat (Cmd+L) and Edit (Cmd+K) on the Live Preview selection. */
export const cursorBridgeHost: Plugin<CursorBridgeConfig | void> = {
  name: "cursorBridge",
  inject: {
    required: [
      "editors",
      "selections",
      "hostCommands",
      "clipboard",
      "dialogs",
      "settings",
      "agentHost",
    ],
  },
  apply(ctx, config) {
    const cursor = isCursorHost(config?.appName);
    // Captured while live: the context-key reset runs after it is disposed.
    const commands = ctx.hostCommands;
    const bridgeConfig = config ?? {
      appName: "",
      surface: unusedSurface,
    };
    void commands.execute("setContext", IS_CURSOR_HOST, cursor);
    ctx.effect(() => async () => {
      await commands.execute("setContext", IS_CURSOR_HOST, undefined);
    });
    ctx.effect(() =>
      commands.register(contributionId("cursorBridge.chat"), () =>
        runBridge(ctx, bridgeConfig, "chat"),
      ),
    );
    ctx.effect(() =>
      commands.register(contributionId("cursorBridge.edit"), () =>
        runBridge(ctx, bridgeConfig, "edit"),
      ),
    );
  },
};

async function runBridge(
  ctx: Context,
  config: CursorBridgeConfig,
  mode: "chat" | "edit",
): Promise<void> {
  if (!isCursorHost(config.appName)) {
    return;
  }
  const panel = ctx.editors.active();
  if (!panel || !pluginEnabled(ctx, panel.document)) {
    return;
  }
  const captured = await captureActiveSelection(ctx.editors, ctx.selections);
  if (!captured) {
    ctx.dialogs.inform("Select text in the note first");
    return;
  }
  const commands = await commandSet(ctx);
  const handoff = await handOffSelection(
    config.surface,
    captured.uri,
    captured.selection,
  );
  // The await above can resume after focus or selection changes. Keep this
  // check and Cursor invocation in the same synchronous turn.
  const confirmed = handoff.ok
    ? confirmActiveEditor(handoff.editor, captured.uri, captured.selection)
    : handoff;
  if (!confirmed.ok) {
    if (handoff.ok) {
      handoff.lease.release();
    }
    ctx.dialogs.error(
      confirmed.reason === "changed"
        ? "The note changed before Cursor could use the selection."
        : "Could not mirror the selection into Cursor’s editor.",
    );
    return;
  }
  if (mode === "chat") {
    await runChat(ctx, captured.selection.text, commands);
    return;
  }
  const edited = await openCursorEdit(ctx.hostCommands.execute, commands);
  if (!edited) {
    ctx.dialogs.error("Cursor Edit is not available in this window.");
  }
}

async function runChat(
  ctx: Context,
  text: string,
  commands: ReadonlySet<string> | undefined,
): Promise<void> {
  const target = await openCursorChat(
    ctx.hostCommands.execute,
    (value) => ctx.clipboard.write(value),
    text,
    commands,
  );
  if (target === "clipboard") {
    ctx.dialogs.inform("Selection copied. Paste it into Cursor Chat.");
    return;
  }
  if (target === "chatFallback") {
    ctx.dialogs.inform(
      "Opened Cursor Chat. Paste the selection if it was not attached.",
    );
  }
}

function pluginEnabled(ctx: Context, document: HostDocument): boolean {
  const config = ctx.settings.forNote(document);
  return (
    config.preset === "obsidian" &&
    (config.features?.cursorBridge?.enabled ?? true)
  );
}

async function commandSet(
  ctx: Context,
): Promise<ReadonlySet<string> | undefined> {
  const environment = await ctx.agentHost.environment();
  return environment?.commands;
}

const unusedSurface: HandoffSurface = {
  acquireLease: () => ({ promote() {}, release() {} }),
  async warm() {},
  async open() {
    throw new Error("cursorBridge handoff surface was not configured");
  },
  async show() {
    throw new Error("cursorBridge handoff surface was not configured");
  },
};
