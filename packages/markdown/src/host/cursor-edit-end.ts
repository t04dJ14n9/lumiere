import * as vscode from "vscode";
import type { EditPromptVisibility } from "../plugins/cursorBridge/handoff";

const ARM_GRACE_MS = 500;
const POLL_MS = 250;

/**
 * Cursor returns a prompt id at open, with no public completion event or way
 * to read its prompt/diff context keys. A contributed when-clause translates
 * prompt presence into passive tree visibility, even if editor focus stays put.
 */
export function watchCursorEditEnd(
  uri: string,
  onEnd: () => void,
  prompt: EditPromptVisibility,
): { dispose(): void } {
  const target = vscode.Uri.parse(uri).toString();
  const armedAt = Date.now();
  let hasSeenPrompt = prompt.visible;
  let isDisposed = false;
  const sample = () => {
    if (isDisposed || Date.now() - armedAt < ARM_GRACE_MS) {
      return;
    }
    if (!hasMirrorTab(target) || hasLeftMirror(target)) {
      finish();
    }
  };
  const observePrompt = (visible: boolean) => {
    if (visible) {
      hasSeenPrompt = true;
    } else if (hasSeenPrompt) {
      // A real open→hidden transition needs no opening grace or focus cycle.
      finish();
    }
  };
  function finish() {
    if (!isDisposed) {
      dispose();
      onEnd();
    }
  }
  const interval = setInterval(sample, POLL_MS);
  const subscriptions = [
    vscode.window.tabGroups.onDidChangeTabs(sample),
    vscode.window.onDidChangeActiveTextEditor(sample),
    { dispose: prompt.onVisibilityChanged(observePrompt) },
  ];
  function dispose() {
    if (isDisposed) {
      return;
    }
    isDisposed = true;
    clearInterval(interval);
    for (const subscription of subscriptions) {
      subscription.dispose();
    }
  }
  return { dispose };
}

function isMirrorTab(tab: vscode.Tab, uri: string): boolean {
  return (
    tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri
  );
}

function hasMirrorTab(uri: string): boolean {
  return vscode.window.tabGroups.all.some((group) =>
    group.tabs.some((tab) => isMirrorTab(tab, uri)),
  );
}

function hasLeftMirror(uri: string): boolean {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (tab && !isMirrorTab(tab, uri)) {
    return true;
  }
  const editor = vscode.window.activeTextEditor;
  return editor !== undefined && editor.document.uri.toString() !== uri;
}
