import * as vscode from "vscode";
import {
  associatedWith,
  Bypass,
  Lease,
  isReclaimableNote,
  reclaimEnabled,
  shouldReclaim,
  shouldWarmBeforeReclaim,
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

function hasNativeOptOut(uri: string): boolean {
  return textBypass.has(uri) || handoffLease.has(uri);
}

interface ReclaimRequest {
  uri: string;
  intent: NavigationIntent | undefined;
  at: number | undefined;
  /** Once reveal delivery has started, later same-tab jumps must supersede. */
  delivering?: boolean;
  /**
   * Sticky: an Open as Text / Edit lease was observed while this transfer was
   * still pending. textBypass TTL (10s) can expire before reveal readiness
   * (up to 15s), so the decision must outlive `has()` alone.
   */
  keepNative?: boolean;
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
 * switch opens notes in the text or Cursor Markdown editor; transfer back to
 * our CustomTextEditorProvider once the native document is ready.
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
        // Before delivery: refresh the selection only. After revealOpened has
        // started, a later hunk must cancel and supersede that delivery.
        if (!request.delivering) {
          capture(tab, uri);
          return;
        }
        request.intent?.token.cancel();
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
    bypassed: hasNativeOptOut,
  };
}

/** Transfer when ready, keeping any dirty text tab and its native undo. */
async function reopen(
  tab: vscode.Tab,
  uri: string,
  request: ReclaimRequest,
  navigation?: NativeNavigation,
): Promise<void> {
  const target = vscode.Uri.parse(uri);
  // showTextDocument has already materialized a text tab's document. Avoid
  // another warm call and its awaits; Cursor Markdown still needs the reissue.
  const isDocumentOpen = vscode.workspace.textDocuments.some(
    (document) => document.uri.toString() === uri,
  );
  if (shouldWarmBeforeReclaim(kindOf(tab), isDocumentOpen)) {
    await warmMarkdownDocument(target);
  }
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
    request.delivering = true;
    request.at = nativeSelectionStart(tab, uri) ?? request.at;
    await revealOpenedWatchingOptOut(uri, request, () =>
      navigation.revealOpened(uri, column, request.at!, request.intent!),
    );
  }
  // Opt-outs or a superseding jump may land during the reveal wait. Do not
  // close a native tab the user just chose (Open as Text / Edit lease) or a
  // transfer that navigation cancelled. keepNative is sticky across bypass TTL.
  if (
    request.keepNative ||
    hasNativeOptOut(uri) ||
    request.intent?.token.cancelled
  ) {
    return;
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

/**
 * Reveal readiness can wait longer than textBypass TTL. Watch for an opt-out
 * during the wait, sticky-mark keepNative, and cancel so delivery stops.
 */
async function revealOpenedWatchingOptOut(
  uri: string,
  request: ReclaimRequest,
  deliver: () => Promise<void>,
): Promise<void> {
  const noteOptOut = () => {
    if (hasNativeOptOut(uri)) {
      request.keepNative = true;
      request.intent?.token.cancel();
      return true;
    }
    return false;
  };
  if (noteOptOut()) {
    return;
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    timer = setInterval(() => {
      noteOptOut();
    }, 25);
    await deliver();
  } finally {
    if (timer !== undefined) {
      clearInterval(timer);
    }
    noteOptOut();
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
    !hasNativeOptOut(uri) &&
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
