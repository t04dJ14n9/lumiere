import type { Context, Plugin } from "@workshop/core";
import type { HostDocument } from "../../shared/runtime";
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
  inject: { required: ["editors", "selections", "workshop"] },
  apply(ctx, config) {
    const cursor = isCursorHost(config?.appName);
    const workshop = ctx.workshop;
    const bridgeConfig = config ?? {
      appName: "",
      surface: unusedSurface,
    };
    void workshop.execute("setContext", IS_CURSOR_HOST, cursor);
    // Captured while live: teardown runs after this context is disposed.
    ctx.effect(() => async () => {
      await workshop.execute("setContext", IS_CURSOR_HOST, undefined);
    });
    ctx.effect(() =>
      workshop.command(contributionId("cursorBridge.chat"), () =>
        runBridge(ctx, bridgeConfig, "chat"),
      ),
    );
    ctx.effect(() =>
      workshop.command(contributionId("cursorBridge.edit"), () =>
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
    ctx.workshop.inform?.("Select text in the note first");
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
    ctx.workshop.error(
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
  const edited = await openCursorEdit(ctx.workshop.execute, commands);
  if (!edited) {
    ctx.workshop.error("Cursor Edit is not available in this window.");
  }
}

async function runChat(
  ctx: Context,
  text: string,
  commands: ReadonlySet<string> | undefined,
): Promise<void> {
  const target = await openCursorChat(
    ctx.workshop.execute,
    (value) => ctx.workshop.clipboard.write(value),
    text,
    commands,
  );
  if (target === "clipboard") {
    ctx.workshop.inform?.("Selection copied. Paste it into Cursor Chat.");
    return;
  }
  if (target === "chatFallback") {
    ctx.workshop.inform?.(
      "Opened Cursor Chat. Paste the selection if it was not attached.",
    );
  }
}

function pluginEnabled(ctx: Context, document: HostDocument): boolean {
  const config = ctx.workshop.config(document);
  return (
    config.preset === "obsidian" &&
    (config.features?.cursorBridge?.enabled ?? true)
  );
}

async function commandSet(
  ctx: Context,
): Promise<ReadonlySet<string> | undefined> {
  const environment = await ctx.workshop.agentEnvironment?.();
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
