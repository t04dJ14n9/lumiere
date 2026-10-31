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
 * Durable in-flight reclaim identity. VS Code rebuilds Tab objects without a
 * tab event; uri+column survives that rebuild (a group holds one tab per note).
 */
export function reclaimKey(uri: string, column: vscode.ViewColumn): string {
  return `${column}\0${uri}`;
}

/**
 * Prefer the scheduled tab when it is still live. After a Tab rebuild (no tab
 * event), scan the column like currentTab: match by kind + native URI.
 */
export function resolveLiveNativeTab(
  tab: vscode.Tab,
  uri: string,
): vscode.Tab | undefined {
  const column = tab.group.viewColumn;
  const kind = kindOf(tab);
  const group = vscode.window.tabGroups.all.find(
    (candidate) => candidate.viewColumn === column,
  );
  if (!group) {
    return undefined;
  }
  if (group.tabs.includes(tab) && showsNatively(tab, uri)) {
    return tab;
  }
  return group.tabs.find(
    (candidate) => kindOf(candidate) === kind && showsNatively(candidate, uri),
  );
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
