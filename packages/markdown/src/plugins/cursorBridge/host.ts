import type { Context, Plugin } from "@workshop/core";
import type { HostDocument } from "../../shared/host";
import type {} from "../editor/api";
import {
  cursorEditAvailable,
  isCursorHost,
  openCursorChat,
  openCursorEdit,
} from "./cursor";
import {
  confirmActiveEditor,
  handOffSelection,
  prepareNativeMirror,
  type HandoffLease,
  type HandoffSurface,
  type SelectionSnapshot,
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
    return;
  }
  const commands = await commandSet(ctx);
  if (mode === "chat" && captured.selection.from === captured.selection.to) {
    await runChat(ctx, "", commands);
    return;
  }
  // Edit with no Cursor Edit command: skip the mirror (avoids a dead Plain Text
  // tab) and fall back to Chat with an edit-oriented notice.
  if (mode === "edit" && !cursorEditAvailable(commands)) {
    await runEditFallbackChat(ctx, captured.selection.text, commands);
    return;
  }
  if (mode === "edit") {
    await runEdit(ctx, config, captured, commands);
    return;
  }
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
  await runChat(ctx, captured.selection.text, commands);
}

/**
 * Hybrid Edit: prefer override-only (Cursor opens the code editor itself),
 * then handoff+Edit if that silently no-ops. Always verify the prompt-bar id
 * return; blind executeCommand success leaves orphan Plain Text tabs.
 */
async function runEdit(
  ctx: Context,
  config: CursorBridgeConfig,
  { uri, selection }: { uri: string; selection: SelectionSnapshot },
  commands: ReadonlySet<string> | undefined,
): Promise<void> {
  const prepared = await prepareNativeMirror(config.surface, uri, selection);
  if (!prepared.ok) {
    ctx.dialogs.error(
      prepared.reason === "changed"
        ? "The note changed before Cursor could use the selection."
        : "Could not mirror the selection into Cursor’s editor.",
    );
    return;
  }
  const target = {
    uri: config.surface.nativeUri(uri),
    range: prepared.range,
  };
  // A. Override-only: no pre-handoff showTextDocument.
  if (await openCursorEdit(ctx.hostCommands.execute, commands, target)) {
    prepared.lease.promote();
    return;
  }
  // B. Handoff then Edit — give Cursor a focused native text editor.
  try {
    const editor = await config.surface.show(prepared.document, prepared.range);
    const confirmed = confirmActiveEditor(editor, uri, selection);
    if (!confirmed.ok) {
      await abandonEditHandoff(config.surface, uri, prepared.lease);
      ctx.dialogs.error(
        confirmed.reason === "changed"
          ? "The note changed before Cursor could use the selection."
          : "Could not mirror the selection into Cursor’s editor.",
      );
      return;
    }
    const edited = await openCursorEdit(ctx.hostCommands.execute, commands, {
      uri: config.surface.nativeUri(uri),
      range: confirmed.editor.selection,
    });
    if (edited) {
      prepared.lease.promote();
      return;
    }
  } catch {
    // show threw — fall through to abandon + Chat.
  }
  // C. Silent Edit no-op (falsy return) or handoff exception: never leave orphans.
  await abandonEditHandoff(config.surface, uri, prepared.lease);
  await runEditFallbackChat(ctx, selection.text, commands);
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
  if (target === "unavailable") {
    ctx.dialogs.error("Cursor Chat is not available in this window.");
  } else if (target === "chatFallback" && text) {
    ctx.dialogs.inform(
      "Opened Cursor Chat. Paste the selection if it was not attached.",
    );
  }
}

/**
 * Edit failed or is unavailable: open Chat instead of leaving a dead mirror.
 * Documents the product choice when `aipopup.action.modal.generate` is missing
 * or silently no-ops after handoff.
 */
async function runEditFallbackChat(
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
  if (target === "unavailable") {
    ctx.dialogs.error("Cursor Edit is not available in this window.");
    return;
  }
  if (target === "clipboard") {
    ctx.dialogs.inform(
      "Cursor Edit is unavailable. Selection copied — paste it into Cursor Chat.",
    );
    return;
  }
  ctx.dialogs.inform(
    text
      ? "Cursor Edit is unavailable. Opened Chat — paste the selection if it was not attached."
      : "Cursor Edit is unavailable. Opened Chat instead.",
  );
}

async function abandonEditHandoff(
  surface: HandoffSurface,
  uri: string,
  lease: HandoffLease,
): Promise<void> {
  lease.release();
  try {
    await surface.dismiss(uri);
  } catch {
    // Best-effort restore; the error toast/fallback still runs.
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
  nativeUri: (uri) => uri,
  async warm() {},
  async open() {
    throw new Error("cursorBridge handoff surface was not configured");
  },
  async show() {
    throw new Error("cursorBridge handoff surface was not configured");
  },
  async dismiss() {},
};
