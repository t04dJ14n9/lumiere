import type { Context, Plugin } from "@workshop/core";
import type { HostDocument, StatusHandle } from "../../shared/host";
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
import {
  registerEditPromptProbe,
  type EditPromptProbe,
} from "./edit-prompt-probe";

const IS_CURSOR_HOST = contributionId("isCursorHost");
const DISMISS_EDIT_MIRROR = contributionId("cursorBridge.dismissEditMirror");
const DISMISS_STATUS_TEXT = "$(markdown) Return to Lumière";
const DISMISS_STATUS_TOOLTIP =
  "Close the Edit mirror and return to Live Preview";

export interface CursorBridgeConfig {
  readonly appName: string;
  readonly surface: HandoffSurface;
}

interface EditMirrorCleanup {
  arm(): void;
  abandon(): Promise<void>;
  dispose(): void;
}

type BridgeSession = CursorBridgeConfig & {
  promptProbe: EditPromptProbe;
  editMirrors: Map<string, EditMirrorCleanup>;
  /** Shared left status bar; shown while any Edit mirror cleanup is armed. */
  dismissStatus: StatusHandle;
  /** URI whose armed cleanup currently owns the dismiss status bar. */
  dismissStatusUri: string | undefined;
  isStopped: boolean;
};

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
      "views",
    ],
  },
  apply(ctx, config) {
    const cursor = isCursorHost(config?.appName);
    // Captured while live: the context-key reset runs after it is disposed.
    const commands = ctx.hostCommands;
    const dismissStatus = ctx.views.status(DISMISS_EDIT_MIRROR, 1000, {
      alignment: "left",
    });
    const bridgeConfig: BridgeSession = {
      ...(config ?? { appName: "", surface: unusedSurface }),
      promptProbe: registerEditPromptProbe(ctx),
      editMirrors: new Map(),
      dismissStatus,
      dismissStatusUri: undefined,
      isStopped: false,
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
    // Status-bar primary dismiss: reliable when Cursor X/Esc leave no public end signal.
    ctx.effect(() =>
      commands.register(DISMISS_EDIT_MIRROR, () => {
        const uri = bridgeConfig.dismissStatusUri;
        if (!uri) {
          return;
        }
        return bridgeConfig.editMirrors.get(uri)?.abandon();
      }),
    );
    ctx.effect(() => () => {
      bridgeConfig.isStopped = true;
      for (const cleanup of bridgeConfig.editMirrors.values()) {
        cleanup.dispose();
      }
      dismissStatus.dispose();
    });
  },
};

async function runBridge(
  ctx: Context,
  config: BridgeSession,
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
  config: BridgeSession,
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
  if (config.isStopped) {
    prepared.lease.release();
    return;
  }
  const cleanup = createEditMirrorCleanup(config, uri, prepared.lease);
  const target = {
    uri: config.surface.nativeUri(uri),
    range: prepared.range,
  };
  // A. Override-only: no pre-handoff showTextDocument.
  if (await openCursorEdit(ctx.hostCommands.execute, commands, target)) {
    prepared.lease.promote();
    cleanup.arm();
    return;
  }
  // B. Handoff then Edit — give Cursor a focused native text editor.
  try {
    const editor = await config.surface.show(prepared.document, prepared.range);
    const confirmed = confirmActiveEditor(editor, uri, selection);
    if (!confirmed.ok) {
      await cleanup.abandon();
      ctx.dialogs.error(
        confirmed.reason === "changed"
          ? "The note changed before Cursor could use the selection."
          : "Could not mirror the selection into Cursor’s editor.",
      );
      return;
    }
    // Use the focused editor and selection from show. overrideUri forces a
    // reload through editorAssociations, which can reopen Lumière instead.
    const edited = await openCursorEdit(ctx.hostCommands.execute, commands);
    if (edited) {
      prepared.lease.promote();
      cleanup.arm();
      return;
    }
  } catch {
    // show threw — fall through to abandon + Chat.
  }
  // C. Silent Edit no-op (falsy return) or handoff exception: never leave orphans.
  await cleanup.abandon();
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

/** One owner per URI: stale callbacks must never close a newer Edit mirror. */
function createEditMirrorCleanup(
  session: BridgeSession,
  uri: string,
  lease: HandoffLease,
): EditMirrorCleanup {
  session.editMirrors.get(uri)?.dispose();
  let isFinished = false;
  let watcher: { dispose(): void } | undefined;
  let disarmProbe: (() => void) | undefined;
  const hideDismissStatus = () => {
    if (session.dismissStatusUri === uri) {
      session.dismissStatusUri = undefined;
      session.dismissStatus.hide();
    }
  };
  const stopWatching = () => {
    if (isFinished) {
      return false;
    }
    isFinished = true;
    watcher?.dispose();
    disarmProbe?.();
    hideDismissStatus();
    session.editMirrors.delete(uri);
    return true;
  };
  const cleanup: EditMirrorCleanup = {
    arm() {
      if (isFinished) {
        return;
      }
      watcher = session.surface.watchEditEnd(
        uri,
        () => {
          void cleanup.abandon();
        },
        session.promptProbe.visibility,
      );
      // A surface may report an already-ended session during registration.
      if (isFinished) {
        watcher.dispose();
        return;
      }
      // Primary UX: explicit status-bar dismiss. Cursor Edit Selection has no
      // public end event; X/Esc alone may leave the mirror until click/tab-leave.
      session.dismissStatusUri = uri;
      session.dismissStatus.show(
        DISMISS_STATUS_TEXT,
        DISMISS_STATUS_TOOLTIP,
        DISMISS_EDIT_MIRROR,
      );
      // Optional when-probe backup: may never become visible on this host.
      disarmProbe = session.promptProbe.arm();
    },
    async abandon() {
      if (stopWatching()) {
        await abandonEditHandoff(session.surface, uri, lease);
      }
    },
    dispose() {
      if (stopWatching()) {
        lease.release();
      }
    },
  };
  session.editMirrors.set(uri, cleanup);
  return cleanup;
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
  watchEditEnd: () => ({ dispose() {} }),
};
