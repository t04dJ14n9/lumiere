import * as vscode from "vscode";
import type { TabKind, TabModel } from "./reclaim-policy";
import { MARKDOWN_EDITOR } from "../shared/editor-provider";

const { viewType } = MARKDOWN_EDITOR;

export function kindOf(tab: vscode.Tab | undefined): TabKind {
  const input = tab?.input;
  if (!tab) {
    return "none";
  }
  if (input instanceof vscode.TabInputCustom) {
    return input.viewType === viewType ? "workbench" : "none";
  }
  if (input instanceof vscode.TabInputText) {
    return "text";
  }
  // Cursor's own Markdown editor has no public tab input type.
  return input === undefined ? "other" : "none";
}

export function uriOf(tab: vscode.Tab): string | undefined {
  const input = tab.input as { uri?: vscode.Uri } | undefined;
  return input?.uri?.toString();
}

/** The tab shows this note in the text or Cursor Markdown editor. */
export function showsNatively(tab: vscode.Tab, uri: string): boolean {
  const kind = kindOf(tab);
  return (
    (kind === "text" || kind === "other") &&
    (uriOf(tab) ?? labelUri(tab)) === uri
  );
}

export const tabModel: TabModel<vscode.Tab> = {
  facts: (tab) => ({ uri: uriOf(tab) ?? labelUri(tab), kind: kindOf(tab) }),
  groupOf: (tab) => tab.group,
  shownTab: () => vscode.window.tabGroups.activeTabGroup.activeTab,
};

/**
 * Prefer the scheduled tab. VS Code may rebuild Tab objects (no tab event)
 * during the Search wait; match the live native tab by URI and column.
 */
export function resolveLiveNativeTab(
  tab: vscode.Tab,
  uri: string,
): vscode.Tab | undefined {
  const active = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (active === tab) {
    return tab;
  }
  if (
    active &&
    showsNatively(active, uri) &&
    active.group.viewColumn === tab.group.viewColumn
  ) {
    return active;
  }
  return undefined;
}

/** Cursor's editor exposes no input; its tabs are matched by their label. */
export function labelUri(tab: vscode.Tab): string | undefined {
  if (tab.input !== undefined) {
    return undefined;
  }
  const documents = vscode.workspace.textDocuments.filter(
    (candidate) =>
      candidate.uri.scheme === "file" &&
      candidate.uri.path.split("/").at(-1) === tab.label,
  );
  // Equal basenames in different folders cannot identify a tab safely.
  return documents.length === 1 ? documents[0]?.uri.toString() : undefined;
}
