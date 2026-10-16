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
import { SourceCoordinates } from "../shared/document/coordinates";
import type { NativeNavigation } from "./navigation";
import type { NavigationIntent } from "../shared/runtime";

const { viewType } = MARKDOWN_EDITOR;

/** Notes this extension opens as text keep it (Open as Text, source commands). */
export const textBypass = new Bypass();

/**
 * cursorBridge Edit/Chat handoff: suppress reclaim for the whole native
 * session, not a fixed window. Released when the note leaves the text editor.
 */
export const handoffLease = new Lease();

interface ReclaimRequest {
  uri: string;
  intent: NavigationIntent | undefined;
  at: number | undefined;
}

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
export function registerReclaim(
  navigation?: NativeNavigation,
): vscode.Disposable {
  const seen = new Map<string, TabKind>();
  const recentTransfers = new Bypass();
  const transfer = createReclaimTransfer(navigation, recentTransfers);
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
  const tabs = vscode.window.tabGroups.onDidChangeTabs((event) => {
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
      if (
        shouldReclaim(swap, reclaimContext(uri)) &&
        !recentTransfers.has(uri)
      ) {
        transfer.open(tab, uri);
      }
    }
    remember();
  });
  return vscode.Disposable.from(
    tabs,
    registerSelectionReclaim(transfer.open, transfer.capture),
    transfer,
  );
}

function createReclaimTransfer(
  navigation: NativeNavigation | undefined,
  recentTransfers: Bypass,
) {
  const pending = new Map<vscode.Tab, ReclaimRequest>();
  const capture = (tab: vscode.Tab, uri: string) => {
    const request = pending.get(tab);
    if (request?.uri === uri && !request.intent?.token.cancelled) {
      request.at = nativeSelectionStart(tab, uri) ?? request.at;
    }
  };
  return {
    capture,
    open(tab: vscode.Tab, uri: string) {
      if (vscode.window.tabGroups.activeTabGroup.activeTab !== tab) {
        return;
      }
      const request = pending.get(tab);
      if (request?.uri === uri && !request.intent?.token.cancelled) {
        capture(tab, uri);
        return;
      }
      recentTransfers.allow(uri);
      const next: ReclaimRequest = {
        uri,
        intent: navigation?.begin(),
        at: nativeSelectionStart(tab, uri),
      };
      pending.set(tab, next);
      void reopen(tab, uri, next, navigation)
        .catch((error) => {
          console.error("Markdown Workshop editor transfer failed", error);
        })
        .finally(() => {
          if (pending.get(tab) === next) {
            pending.delete(tab);
          }
        });
    },
    dispose() {
      for (const request of pending.values()) {
        request.intent?.token.cancel();
      }
    },
  };
}

/** Command jumps also arrive when Cursor reuses a native tab without a tab change. */
function registerSelectionReclaim(
  transfer: (tab: vscode.Tab, uri: string) => void,
  capture: (tab: vscode.Tab, uri: string) => void,
): vscode.Disposable {
  const selections = vscode.window.onDidChangeTextEditorSelection((event) => {
    if (
      event.kind !== vscode.TextEditorSelectionChangeKind.Command ||
      event.textEditor !== vscode.window.activeTextEditor
    ) {
      return;
    }
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const uri = event.textEditor.document.uri.toString();
    if (
      !tab ||
      nativeSelectionStart(tab, uri) === undefined ||
      !shouldReclaim(
        { uri, before: "none", after: kindOf(tab) },
        reclaimContext(uri),
      )
    ) {
      return;
    }
    transfer(tab, uri);
  });
  // Tab notifications can precede the native editor snapshot. Its initial
  // selection arrives with activation, without a separate selection event.
  const activation = vscode.window.onDidChangeActiveTextEditor((editor) => {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (editor && tab) {
      capture(tab, editor.document.uri.toString());
    }
  });
  return vscode.Disposable.from(selections, activation);
}

function nativeSelectionStart(
  tab: vscode.Tab,
  uri: string,
): number | undefined {
  const editor = vscode.window.activeTextEditor;
  if (
    !editor ||
    editor.viewColumn !== tab.group.viewColumn ||
    editor.document.uri.toString() !== uri ||
    (uriOf(tab) ?? labelUri(tab)) !== uri
  ) {
    return undefined;
  }
  const document = editor.document;
  return new SourceCoordinates(document.getText()).toEditor(
    document.offsetAt(editor.selection.start),
  );
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
async function reopen(
  tab: vscode.Tab,
  uri: string,
  request: ReclaimRequest,
  navigation?: NativeNavigation,
): Promise<void> {
  const target = vscode.Uri.parse(uri);
  await warmMarkdownDocument(target);
  if (!canReopen(tab, uri, request)) {
    return;
  }
  const column = tab.group.viewColumn;
  request.at = nativeSelectionStart(tab, uri) ?? request.at;
  await vscode.commands.executeCommand("vscode.openWith", target, viewType, {
    viewColumn: column,
    preview: tab.isPreview,
  });
  if (navigation && request.intent && request.at !== undefined) {
    await navigation.revealOpened(uri, column, request.at, request.intent);
  }
  const group = vscode.window.tabGroups.all.find(
    (candidate) => candidate.viewColumn === column,
  );
  const text = group?.tabs.find(
    (candidate) =>
      candidate === tab &&
      candidate.input instanceof vscode.TabInputText &&
      candidate.input.uri.toString() === uri,
  );
  if (text && !text.isDirty) {
    await vscode.window.tabGroups.close(text, true);
  }
}

/** Warming can outlive a handoff, a newer jump, or the reader leaving this tab. */
function canReopen(
  tab: vscode.Tab,
  uri: string,
  request: ReclaimRequest,
): boolean {
  const kind = kindOf(tab);
  return (
    !handoffLease.has(uri) &&
    !textBypass.has(uri) &&
    !request.intent?.token.cancelled &&
    tab.group.tabs.includes(tab) &&
    (kind === "text" || kind === "other") &&
    (uriOf(tab) ?? labelUri(tab)) === uri &&
    vscode.window.tabGroups.activeTabGroup.activeTab === tab
  );
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
