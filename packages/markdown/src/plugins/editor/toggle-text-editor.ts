import type { Context } from "@workshop/core";
import type { ActiveEditor, HostCommands } from "../../shared/host";
import { MARKDOWN_EDITOR } from "../../shared/editor-provider";
import { contributionId } from "../../shared/setting-schema";
import type { EditorPanel, Editors } from "./api";

/**
 * Host deps for the Ctrl/Cmd+E toggle. Kept as a pick so unit tests can
 * exercise the branch logic without a full editor host.
 */
export interface ToggleTextEditorHost {
  editors: Editors;
  activeEditor: ActiveEditor;
  hostCommands: HostCommands;
  /** Serialise document flush the same way Open as Text does. */
  serial: Context["serial"];
}

/**
 * Toggle the active Markdown note between Lumière and the host's default
 * text editor (`vscode.openWith` with `"default"` or our viewType).
 *
 * Obsidian's Ctrl/Cmd+E toggles Live Preview ↔ Source; this intentionally
 * does not — Source mode stays on the unbound `toggleSourceMode` command.
 *
 * Selection and caret are not transferred: `vscode.openWith` carries no
 * range, and restoring one needs the reclaim/reveal pipeline used for
 * Preview | Markdown handoff. Follow-up if that becomes required.
 *
 * `openWith` opens a second tab beside the previous view; the leave-behind
 * is closed so only one tab remains (BH-011 / BH-003).
 */
export async function toggleTextEditor(
  host: ToggleTextEditorHost,
): Promise<void> {
  const panel = host.editors.active();
  if (panel) {
    await openPanelAsText(host, panel);
    return;
  }
  const uri = host.activeEditor.note();
  if (!uri || !host.activeEditor.textEditor(uri)) {
    return;
  }
  await host.hostCommands.execute(
    "vscode.openWith",
    uri,
    MARKDOWN_EDITOR.viewType,
  );
  await host.activeEditor.closeSiblingTabs(uri, "lumiere");
}

async function openPanelAsText(
  host: ToggleTextEditorHost,
  panel: EditorPanel,
): Promise<void> {
  const uri = panel.document.uri;
  await panel.session.withAction(async () => {
    await host.serial("document/willSave", panel.session);
    await panel.session.flush();
    if (!panel.active()) {
      throw new Error("The editor lost focus before the command completed.");
    }
    await host.hostCommands.execute("vscode.openWith", uri, "default");
  });
  await host.activeEditor.closeSiblingTabs(uri, "text");
}

/** Palette and keybinding registration for the toggle. */
export function registerToggleTextEditor(ctx: Context, editors: Editors): void {
  ctx.effect(() =>
    ctx.hostCommands.register(contributionId("toggleTextEditor"), () =>
      toggleTextEditor({
        editors,
        activeEditor: ctx.activeEditor,
        hostCommands: ctx.hostCommands,
        // Keep Context as `this`: serial() calls this.assertLive().
        serial: ctx.serial.bind(ctx) as Context["serial"],
      }),
    ),
  );
}
