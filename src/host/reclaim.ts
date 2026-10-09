import * as vscode from "vscode";
import {
  associatedWith,
  Bypass,
  isReclaimableNote,
  reclaimEnabled,
  shouldReclaim,
} from "./reclaim-policy";
import type { TabKind } from "./reclaim-policy";
import { MARKDOWN_EDITOR } from "../shared/editor-provider";

const { viewType } = MARKDOWN_EDITOR;

/** Notes this extension opens as text keep it (Open as Text, source commands). */
export const textBypass = new Bypass();

function kindOf(tab: vscode.Tab | undefined): TabKind {
  const input = tab?.input;
  if (!tab) {
    return "none";
  }
  if (input instanceof vscode.TabInputCustom) {
    return input.viewType === viewType ? "workbench" : "other";
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

/**
 * `markdownWorkbench.editor.reclaimTextEditor`: Cursor's Preview | Markdown
 * switch opens notes in the plain text editor; reopen them here instead.
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
    const enabled = reclaimEnabled({
      mode: vscode.workspace
        .getConfiguration("markdownWorkbench")
        .get<"auto" | "on" | "off">("editor.reclaimTextEditor", "auto"),
      appName: vscode.env.appName,
    });
    for (const tab of [...event.opened, ...event.changed]) {
      const uri = uriOf(tab);
      const before = uri ? seen.get(key(tab, uri)) : undefined;
      const swap = {
        uri: uri ?? "",
        before: before ?? "none",
        after: kindOf(tab),
      };
      const context = {
        enabled,
        isNote: isReclaimableNote,
        associated: (value: string) =>
          associatedWith(
            vscode.workspace
              .getConfiguration("workbench")
              .get("editorAssociations"),
            value,
            viewType,
          ),
        bypassed: (value: string) => textBypass.has(value),
      };
      if (uri && shouldReclaim(swap, context)) {
        textBypass.allow(uri);
        void reopen(tab, uri);
      }
    }
    remember();
  });
}

/** Open the note here in the text tab's place, then close the text tab. */
async function reopen(tab: vscode.Tab, uri: string): Promise<void> {
  const column = tab.group.viewColumn;
  await vscode.commands.executeCommand(
    "vscode.openWith",
    vscode.Uri.parse(uri),
    viewType,
    { viewColumn: column, preview: tab.isPreview },
  );
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
  const document = vscode.workspace.textDocuments.find(
    (candidate) =>
      candidate.uri.scheme === "file" &&
      candidate.uri.path.split("/").at(-1) === tab.label,
  );
  return document?.uri.toString();
}
