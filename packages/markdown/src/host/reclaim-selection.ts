import * as vscode from "vscode";
import { SourceCoordinates } from "../shared/document/coordinates";
import { reclaimKey } from "./reclaim-tabs";

export interface NativeSelection {
  at: number;
  to?: number;
}

export function nativeSelectionRange(
  tab: vscode.Tab,
  uri: string,
  tabUri: (tab: vscode.Tab) => string | undefined,
): NativeSelection | undefined {
  const editor = vscode.window.activeTextEditor;
  if (
    !editor ||
    editor.viewColumn !== tab.group.viewColumn ||
    editor.document.uri.toString() !== uri ||
    tabUri(tab) !== uri
  ) {
    return undefined;
  }
  const document = editor.document;
  const coordinates = new SourceCoordinates(document.getText());
  const at = coordinates.toEditor(document.offsetAt(editor.selection.start));
  const to = coordinates.toEditor(document.offsetAt(editor.selection.end));
  return to > at ? { at, to } : { at };
}

/** A Search match has both ends. A caret, including one at offset 0, does not. */
export function hasRangeSelection(
  selection: NativeSelection | undefined,
): boolean {
  return selection?.to !== undefined && selection.to > selection.at;
}

export function createReclaimScheduler(options: {
  open: (tab: vscode.Tab, uri: string) => void;
  readSelection: (tab: vscode.Tab, uri: string) => NativeSelection | undefined;
  waitForTextSelection: () => boolean;
}) {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const waiting = new Map<
    string,
    { uri: string; fallback: ReturnType<typeof setTimeout> }
  >();
  const ready = (tab: vscode.Tab, uri: string, force = false): void => {
    const key = reclaimKey(uri, tab.group.viewColumn);
    const pending = waiting.get(key);
    if (
      !pending ||
      pending.uri !== uri ||
      (!force && !hasRangeSelection(options.readSelection(tab, uri)))
    ) {
      return;
    }
    waiting.delete(key);
    clearTimeout(pending.fallback);
    timers.delete(pending.fallback);
    options.open(tab, uri);
  };
  const schedule = (tab: vscode.Tab, uri: string, wait: boolean): void => {
    if (!wait || !options.waitForTextSelection()) {
      options.open(tab, uri);
      return;
    }
    if (hasRangeSelection(options.readSelection(tab, uri))) {
      options.open(tab, uri);
      return;
    }
    // VS Code publishes the text tab before Search applies its range. Wait for
    // the matching active editor; the fallback keeps nonstandard hosts moving.
    // Key by uri+column so a Tab rebuild during the wait still hits ready().
    const key = reclaimKey(uri, tab.group.viewColumn);
    const fallback = scheduleTimer(timers, () => ready(tab, uri, true), 250);
    waiting.set(key, { uri, fallback });
    scheduleTimer(timers, () => ready(tab, uri), 0);
  };
  return {
    schedule,
    ready,
    dispose() {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
      waiting.clear();
    },
  };
}

export function registerSelectionReclaim(options: {
  capture: (tab: vscode.Tab, uri: string) => void;
  ready: (tab: vscode.Tab, uri: string) => void;
  shouldTransfer: (tab: vscode.Tab, uri: string) => boolean;
  transfer: (tab: vscode.Tab, uri: string) => void;
}): vscode.Disposable {
  const selection = vscode.window.onDidChangeTextEditorSelection((event) => {
    if (event.textEditor !== vscode.window.activeTextEditor) {
      return;
    }
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const uri = event.textEditor.document.uri.toString();
    if (tab) {
      options.ready(tab, uri);
      options.capture(tab, uri);
    }
    if (
      event.kind === vscode.TextEditorSelectionChangeKind.Command &&
      tab &&
      options.shouldTransfer(tab, uri)
    ) {
      options.transfer(tab, uri);
    }
  });
  // Tab notifications can precede the native editor snapshot. Its initial
  // selection arrives with activation, without a separate selection event.
  const activation = vscode.window.onDidChangeActiveTextEditor((editor) => {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (editor && tab) {
      const uri = editor.document.uri.toString();
      options.ready(tab, uri);
      options.capture(tab, uri);
    }
  });
  return vscode.Disposable.from(selection, activation);
}

function scheduleTimer(
  timers: Set<ReturnType<typeof setTimeout>>,
  run: () => void,
  delay: number,
): ReturnType<typeof setTimeout> {
  const timer = setTimeout(() => {
    timers.delete(timer);
    run();
  }, delay);
  timers.add(timer);
  return timer;
}
