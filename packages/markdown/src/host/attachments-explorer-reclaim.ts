/**
 * VS Code-only: reclaim Explorer drop-without-Shift media tabs as attachments.
 *
 * Workbench disables pointer events on custom-editor webviews during Explorer
 * drags unless Shift is held, so the drop opens a pinned tab instead of
 * reaching the page. Portable hosts omit this hook (no `tabGroups`).
 */
import * as vscode from "vscode";
import type { Disposer } from "@workshop/core";
import { shouldReclaimExplorerOpen } from "../attachments";
import { MARKDOWN_EDITOR } from "../shared/editor-provider";
import type { ExplorerAttachmentReclaimHandlers } from "../shared/host";

/**
 * Watch tab opens and convert matching pinned media tabs into attachments on
 * the prior Lumière note in that column.
 */
export function registerAttachmentsExplorerReclaim(
  handlers: ExplorerAttachmentReclaimHandlers,
): Disposer {
  /** viewColumn → Lumière note URI last known active in that column. */
  const priorLumiere = new Map<number, string>();
  const syncPrior = () => {
    const groups = vscode.window?.tabGroups?.all;
    if (!groups) {
      return;
    }
    for (const group of groups) {
      const column = group.viewColumn;
      if (column === undefined) {
        continue;
      }
      const active = group.activeTab;
      if (active && isLumiereTab(active)) {
        const uri = tabUri(active)?.toString();
        if (uri) {
          priorLumiere.set(column, uri);
          continue;
        }
      }
      // Clear when another editor is active so a later media open is not
      // mistaken for a drop onto this note.
      priorLumiere.delete(column);
    }
  };
  syncPrior();
  const sub = vscode.window.tabGroups.onDidChangeTabs((event) => {
    const victims = [...event.opened];
    // Snapshot priors before syncing — opens have already stolen active.
    void reclaimOpenedTabs(handlers, victims, priorLumiere).finally(syncPrior);
  });
  return () => sub.dispose();
}

async function reclaimOpenedTabs(
  handlers: ExplorerAttachmentReclaimHandlers,
  opened: readonly vscode.Tab[],
  priorLumiere: ReadonlyMap<number, string>,
): Promise<void> {
  for (const tab of opened) {
    await reclaimOneTab(handlers, tab, priorLumiere);
  }
}

async function reclaimOneTab(
  handlers: ExplorerAttachmentReclaimHandlers,
  tab: vscode.Tab,
  priorLumiere: ReadonlyMap<number, string>,
): Promise<void> {
  const resource = tabUri(tab);
  const column = tab.group.viewColumn;
  if (!resource || column === undefined) {
    return;
  }
  const priorNote = priorLumiere.get(column);
  const lumiereTab = tab.group.tabs.find(isLumiereTab);
  const lumiereUri = lumiereTab ? tabUri(lumiereTab)?.toString() : undefined;
  if (
    !shouldReclaimExplorerOpen({
      openedPath: resource.fsPath || resource.path,
      isPreview: tab.isPreview,
      groupHadLumiereNote: Boolean(lumiereUri),
      priorActiveWasLumiere: Boolean(
        priorNote && lumiereUri && priorNote === lumiereUri,
      ),
    })
  ) {
    return;
  }
  if (!lumiereUri) {
    return;
  }

  // Close the workbench's open-on-drop tab; the plugin reveals the note.
  try {
    await vscode.window.tabGroups.close(tab, true);
  } catch {
    // Tab may already be gone.
  }

  await handlers.reclaim({
    resourceUri: resource.toString(),
    column,
    lumiereUri,
  });
}

function isLumiereTab(tab: vscode.Tab): boolean {
  const input = tab.input;
  return (
    typeof vscode.TabInputCustom === "function" &&
    input instanceof vscode.TabInputCustom &&
    input.viewType === MARKDOWN_EDITOR.viewType
  );
}

function tabUri(tab: vscode.Tab): vscode.Uri | undefined {
  const input = tab.input as { uri?: vscode.Uri } | undefined;
  return input?.uri;
}
