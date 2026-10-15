import * as vscode from "vscode";
import {
  associatedWith,
  Bypass,
  Lease,
  isReclaimableNote,
  reclaimEnabled,
  shouldReclaim,
} from "./reclaim-policy";
import type { TabKind } from "./reclaim-policy";
import { MARKDOWN_EDITOR } from "../shared/editor-provider";
import { warmMarkdownDocument } from "./document-warm";

const { viewType } = MARKDOWN_EDITOR;

/** Notes this extension opens as text keep it (Open as Text, source commands). */
export const textBypass = new Bypass();

/**
 * cursorBridge Edit/Chat handoff: suppress reclaim for the whole native
 * session, not a fixed window. Released when the note leaves the text editor.
 */
export const handoffLease = new Lease();

function kindOf(tab: vscode.Tab | undefined): TabKind {
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

function uriOf(tab: vscode.Tab): string | undefined {
  const input = tab.input as { uri?: vscode.Uri } | undefined;
  return input?.uri?.toString();
}

function releaseLeaseWithoutTextTab(tab: vscode.Tab): void {
  const uri = uriOf(tab) ?? labelUri(tab);
  if (!uri || !handoffLease.has(uri)) {
    return;
  }
  // Same-URI custom tabs can close or become inactive during Cursor Edit.
  // Established sessions end only when no native text tab remains in any group.
  // Pending handoffs keep their own tokens while warming/opening the next tab.
  const hasNativeTextTab = vscode.window.tabGroups.all.some((group) =>
    group.tabs.some(
      (candidate) =>
        candidate.input instanceof vscode.TabInputText &&
        candidate.input.uri.toString() === uri,
    ),
  );
  if (!hasNativeTextTab) {
    handoffLease.clear(uri);
  }
}

/**
 * `markdownWorkshop.editor.reclaimTextEditor`: Cursor's Preview | Markdown
 * switch opens notes in the text or Cursor Markdown editor; warm them before
 * transferring back to our CustomTextEditorProvider.
 */
export function registerReclaim(): vscode.Disposable {
  const seen = new Map<string, TabKind>();
  const key = (tab: vscode.Tab, uri: string) =>
    `${tab.group.viewColumn}:${uri}`;
  const remember = () => {
    seen.clear();
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const uri = uriOf(tab) ?? labelUri(tab);
        if (uri) {
          seen.set(key(tab, uri), kindOf(tab));
        }
      }
    }
  };
  remember();
  return vscode.window.tabGroups.onDidChangeTabs((event) => {
    for (const tab of [...event.closed, ...event.opened, ...event.changed]) {
      releaseLeaseWithoutTextTab(tab);
    }
    for (const tab of [...event.opened, ...event.changed]) {
      const uri = uriOf(tab) ?? labelUri(tab);
      if (!uri) {
        continue;
      }
      const after = kindOf(tab);
      const swap = {
        uri,
        before: seen.get(key(tab, uri)) ?? "none",
        after,
      };
      if (shouldReclaim(swap, reclaimContext(uri))) {
        textBypass.allow(uri);
        void reopen(tab, uri);
      }
    }
    remember();
  });
}

function reclaimContext(uri: string) {
  const target = vscode.Uri.parse(uri);
  return {
    enabled: reclaimEnabled({
      mode: vscode.workspace
        .getConfiguration("markdownWorkshop", target)
        .get<"auto" | "on" | "off">("editor.reclaimTextEditor", "auto"),
      appName: vscode.env.appName,
    }),
    isNote: isReclaimableNote,
    associated: (value: string) =>
      associatedWith(
        vscode.workspace
          .getConfiguration("workbench", target)
          .get("editorAssociations"),
        value,
        viewType,
      ),
    bypassed: (value: string) =>
      textBypass.has(value) || handoffLease.has(value),
  };
}

/** Transfer after warming, keeping any dirty text tab and its native undo. */
async function reopen(tab: vscode.Tab, uri: string): Promise<void> {
  const column = tab.group.viewColumn;
  const target = vscode.Uri.parse(uri);
  await warmMarkdownDocument(target);
  // A handoff lease acquired while warming must cancel this reclaim.
  if (handoffLease.has(uri)) {
    return;
  }
  // Cursor may finish its own transfer or close the tab while warming.
  const kind = kindOf(tab);
  if (
    !tab.group.tabs.includes(tab) ||
    (kind !== "text" && kind !== "other") ||
    (uriOf(tab) ?? labelUri(tab)) !== uri
  ) {
    return;
  }
  // Warm already ran; do not steal focus if the reader moved to another tab
  // (including another editor of the same URI in this group).
  const active = vscode.window.tabGroups.activeTabGroup?.activeTab;
  if (active !== tab) {
    return;
  }
  // Recheck lease immediately before openWith (queued reclaim honor).
  if (handoffLease.has(uri)) {
    return;
  }
  await vscode.commands.executeCommand("vscode.openWith", target, viewType, {
    viewColumn: column,
    preview: tab.isPreview,
  });
  const group = vscode.window.tabGroups.all.find(
    (candidate) => candidate.viewColumn === column,
  );
  const text = group?.tabs.find(
    (candidate) =>
      candidate.input instanceof vscode.TabInputText &&
      candidate.input.uri.toString() === uri,
  );
  if (text && !text.isDirty) {
    await vscode.window.tabGroups.close(text, true);
  }
}

/** Cursor's editor exposes no input; its tabs are matched by their label. */
function labelUri(tab: vscode.Tab): string | undefined {
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
