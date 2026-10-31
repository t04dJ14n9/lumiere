import * as vscode from "vscode";
import {
  associatedWith,
  Bypass,
  Lease,
  isReclaimableNote,
  reclaimEnabled,
  shouldHoldNativeAfterReclaim,
  shouldReclaim,
  shouldWarmBeforeReclaim,
  TabSwaps,
} from "./reclaim-policy";
import type { TabKind, TabModel, TabSwap } from "./reclaim-policy";
import {
  MARKDOWN_EDITOR,
  MARKDOWN_WORKSPACE_EDITOR_KEY,
} from "../shared/editor-provider";
import { warmMarkdownDocument } from "./document-warm";
import { readerText } from "./reader-text";
import type { NativeNavigation } from "./navigation";
import type { NavigationIntent } from "../shared/host";
import { openRange, withNativeSelectionOpen } from "./native-selection-open";
import {
  createReclaimScheduler,
  nativeSelectionRange as readNativeSelectionRange,
  registerSelectionReclaim,
} from "./reclaim-selection";

const { viewType } = MARKDOWN_EDITOR;

/** Notes this extension opens as text keep it (Open as Text, source commands). */
export const textBypass = new Bypass();

/**
 * cursorBridge Edit/Chat handoff: suppress reclaim for the whole native
 * session, not a fixed window. Released when the note leaves the text editor.
 */
export const handoffLease = new Lease();

function hasNativeOptOut(uri: string): boolean {
  return textBypass.has(uri) || handoffLease.has(uri) || readerText.has(uri);
}

interface ReclaimRequest {
  uri: string;
  /** Where the note was native: how the tab is found again (see currentTab). */
  column: vscode.ViewColumn;
  kind: TabKind;
  intent: NavigationIntent | undefined;
  at: number | undefined;
  to: number | undefined;
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

/** The tab shows this note in the text or Cursor Markdown editor. */
function showsNatively(tab: vscode.Tab, uri: string): boolean {
  const kind = kindOf(tab);
  return (
    (kind === "text" || kind === "other") &&
    (uriOf(tab) ?? labelUri(tab)) === uri
  );
}

const tabModel: TabModel<vscode.Tab> = {
  facts: (tab) => ({ uri: uriOf(tab) ?? labelUri(tab), kind: kindOf(tab) }),
  groupOf: (tab) => tab.group,
  shownTab: () => vscode.window.tabGroups.activeTabGroup.activeTab,
};

/** Returns the note whose Cursor Edit session this tab change ended. */
function releaseLeaseWithoutTextTab(tab: vscode.Tab): string | undefined {
  const uri = uriOf(tab) ?? labelUri(tab);
  if (!uri || !handoffLease.has(uri)) {
    return undefined;
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
  return handoffLease.has(uri) ? undefined : uri;
}

/**
 * `lumiere.markdown.editor.reclaimTextEditor`: a note that Cursor shows in its
 * own Markdown editor, that a tool opens in a new text tab (a chat link, a
 * review card), or that a tool replaces in place from Lumière to text
 * (Claude `showTextDocument`), moves back to our CustomTextEditorProvider
 * once the native document is ready. Explicit Open as Text / Toggle /
 * handoff stays via bypass and readerText.
 */
export function registerReclaim(
  navigation?: NativeNavigation,
  memory?: vscode.Memento,
): vscode.Disposable & { adoptOpenTabs(): void } {
  const recentTransfers = new Bypass();
  const transfer = createReclaimTransfer(navigation, recentTransfers);
  const swaps = new TabSwaps(tabModel);
  readerText.restore(memory);
  const workspaceDefault = () =>
    memory?.get(MARKDOWN_WORKSPACE_EDITOR_KEY, false) ?? false;
  const scheduler = createReclaimScheduler({
    open: transfer.open,
    readSelection: nativeSelectionRange,
    waitForTextSelection: workspaceDefault,
  });
  const judge = createReclaimJudge({
    recentTransfers,
    swaps,
    workspaceDefault,
    schedule: (tab, swap) =>
      scheduler.schedule(tab, swap.uri, swap.after === "text"),
  });
  const tabs = vscode.window.tabGroups.onDidChangeTabs((event) => {
    const ended = [...event.closed, ...event.opened, ...event.changed]
      .map(releaseLeaseWithoutTextTab)
      .filter((uri): uri is string => uri !== undefined);
    readerText.forgetClosed(event.closed);
    swaps.next(event, new Set(ended)).forEach(judge);
  });
  const stop = vscode.Disposable.from(
    tabs,
    registerSelectionReclaim({
      capture: transfer.capture,
      ready: scheduler.ready,
      shouldTransfer: (tab, uri) =>
        hasSelectionTarget(nativeSelectionRange(tab, uri)) &&
        shouldReclaim(
          { uri, before: "none", after: kindOf(tab) },
          reclaimContext(uri, workspaceDefault()),
        ),
      transfer: transfer.open,
    }),
    scheduler,
    transfer,
  );
  return {
    dispose: () => stop.dispose(),
    /**
     * Judge the tabs already open, once, when the extension starts: notes the
     * window restored, or that were opened before it started, as text.
     */
    adoptOpenTabs() {
      // Kept notes whose text tab the last window closed are not kept now.
      readerText.forgetClosed();
      swaps
        .adopt(vscode.window.tabGroups.all.flatMap((group) => group.tabs))
        .forEach(judge);
    },
  };
}

function createReclaimJudge(options: {
  recentTransfers: Bypass;
  swaps: TabSwaps<vscode.Tab>;
  workspaceDefault: () => boolean;
  schedule: (tab: vscode.Tab, swap: TabSwap) => void;
}) {
  return ({ tab, swap }: { tab: vscode.Tab; swap: TabSwap }) => {
    if (handoffLease.has(swap.uri)) {
      options.swaps.hold(tab, swap);
      return;
    }
    if (
      !shouldReclaim(swap, reclaimContext(swap.uri, options.workspaceDefault()))
    ) {
      // Do not permanently keep unbidden workbench→text skips (e.g. not
      // associated / reclaim off). Opt-outs and other→text reader paths still
      // keep. Claude reclaim never enters this branch when associated.
      if (
        swap.after === "text" &&
        isReclaimableNote(swap.uri) &&
        (hasNativeOptOut(swap.uri) || swap.before !== "workbench")
      ) {
        readerText.keep(swap.uri);
      }
      return;
    }
    const hasTarget = hasSelectionTarget(nativeSelectionRange(tab, swap.uri));
    if (
      shouldHoldNativeAfterReclaim({
        recentTransfer: options.recentTransfers.has(swap.uri),
        reclaimable: true,
        hasSelectionTarget: hasTarget,
      })
    ) {
      textBypass.allow(swap.uri);
      if (swap.after === "text") {
        readerText.keep(swap.uri);
      }
      return;
    }
    options.schedule(tab, swap);
  };
}

function createReclaimTransfer(
  navigation: NativeNavigation | undefined,
  recentTransfers: Bypass,
) {
  const pending = new Map<vscode.Tab, ReclaimRequest>();
  const capture = (tab: vscode.Tab, uri: string) => {
    const request = pending.get(tab);
    if (request?.uri === uri && !request.intent?.token.cancelled) {
      refreshRequestSelection(tab, uri, request);
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
      const selection = nativeSelectionRange(tab, uri);
      const next: ReclaimRequest = {
        uri,
        column: tab.group.viewColumn,
        kind: kindOf(tab),
        intent: navigation?.begin(),
        at: selection?.at,
        to: selection?.to,
      };
      pending.set(tab, next);
      void reopen(uri, next, navigation)
        .catch((error) => {
          console.error("Lumière editor transfer failed", error);
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

function nativeSelectionRange(
  tab: vscode.Tab,
  uri: string,
): { at: number; to?: number } | undefined {
  return readNativeSelectionRange(
    tab,
    uri,
    (candidate) => uriOf(candidate) ?? labelUri(candidate),
  );
}

function hasSelectionTarget(s?: { at: number; to?: number }): boolean {
  return s !== undefined && (s.at > 0 || (s.to !== undefined && s.to > s.at));
}

function reclaimContext(uri: string, workspaceDefault: boolean) {
  const target = vscode.Uri.parse(uri);
  return {
    enabled: reclaimEnabled(
      {
        mode: vscode.workspace
          .getConfiguration("lumiere.markdown", target)
          .get<"auto" | "on" | "off">("editor.reclaimTextEditor", "auto"),
        appName: vscode.env.appName,
      },
      workspaceDefault,
    ),
    isNote: isReclaimableNote,
    associated: (value: string) =>
      associatedWith(
        vscode.workspace
          .getConfiguration("workbench", target)
          .get("editorAssociations"),
        value,
        viewType,
        workspaceDefault,
      ),
    bypassed: hasNativeOptOut,
  };
}

function refreshRequestSelection(
  tab: vscode.Tab,
  uri: string,
  request: ReclaimRequest,
): void {
  const selection = nativeSelectionRange(tab, uri);
  if (selection) {
    request.at = selection.at;
    request.to = selection.to;
  }
}

/** Transfer when ready, keeping any dirty text tab and its native undo. */
async function reopen(
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
  if (shouldWarmBeforeReclaim(request.kind, isDocumentOpen)) {
    await warmMarkdownDocument(target);
  }
  const native = reopenableTab(request);
  if (!native) {
    return;
  }
  const { column } = request;
  refreshRequestSelection(native, uri, request);
  const open = () =>
    vscode.commands.executeCommand("vscode.openWith", target, viewType, {
      viewColumn: column,
      preview: native.isPreview,
    });
  await withNativeSelectionOpen(uri, column, () => openRange(request), open);
  if (navigation && request.intent && request.at !== undefined) {
    request.delivering = true;
    refreshRequestSelection(native, uri, request);
    await revealOpenedWatchingOptOut(uri, request, () =>
      navigation.revealOpened(
        uri,
        column,
        {
          at: request.at!,
          ...(request.to !== undefined ? { to: request.to } : {}),
        },
        request.intent!,
      ),
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
  // openWith opens a second tab beside the native one; left open, a Cursor
  // Markdown tab would sit next to the note's Workshop tab.
  const left = currentTab(request);
  if (left && !left.isDirty) {
    await vscode.window.tabGroups.close(left, true);
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
function reopenableTab(request: ReclaimRequest): vscode.Tab | undefined {
  if (hasNativeOptOut(request.uri) || request.intent?.token.cancelled) {
    return undefined;
  }
  const native = currentTab(request);
  return native && vscode.window.tabGroups.activeTabGroup.activeTab === native
    ? native
    : undefined;
}

/**
 * The transfer's native tab as the tab model shows it now. VS Code rebuilds
 * that model with new Tab objects, and no tab event, after some editor
 * changes (Cursor does right after openWith), so the tab is found again by
 * what it shows: a group holds at most one tab per editor and note.
 */
function currentTab(request: ReclaimRequest): vscode.Tab | undefined {
  const group = vscode.window.tabGroups.all.find(
    (candidate) => candidate.viewColumn === request.column,
  );
  return group?.tabs.find(
    (candidate) =>
      kindOf(candidate) === request.kind &&
      showsNatively(candidate, request.uri),
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
