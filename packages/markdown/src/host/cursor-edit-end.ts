import * as vscode from "vscode";
import type { EditPromptVisibility } from "../plugins/cursorBridge/handoff";

const ARM_GRACE_MS = 500;
const POLL_MS = 250;
/** Ctrl+W / Close All often activate another tab before removing the mirror. */
const LEAVE_SETTLE_MS = 50;

export type EditEnd = {
  /**
   * When true, dismiss may put Live Preview back where the mirror was.
   * False when the reader already closed the mirror (Ctrl+W, Close All).
   */
  readonly restore: boolean;
};

/**
 * Hard backups for Edit-mirror cleanup: last native text tab closed, or the
 * active tab/editor leaving the mirror URI. Cursor has no public Edit-end
 * event; the primary UX is a status-bar dismiss control in cursorBridge host.
 * An optional when-probe visibility signal may also fire if Cursor exposes
 * prompt context keys that make the contributed Explorer probe appear.
 */
export function watchCursorEditEnd(
  uri: string,
  onEnd: (end: EditEnd) => void,
  prompt: EditPromptVisibility,
): { dispose(): void } {
  const target = vscode.Uri.parse(uri).toString();
  const armedAt = Date.now();
  let hasSeenPrompt = prompt.visible;
  let isDisposed = false;
  const leave = settleLeave(target, finish);
  const sample = () => {
    if (isDisposed || Date.now() - armedAt < ARM_GRACE_MS) {
      return;
    }
    if (!hasMirrorTab(target)) {
      finish({ restore: false });
    } else if (hasLeftMirror(target)) {
      leave.start();
    }
  };
  const observePrompt = (visible: boolean) => {
    if (visible) {
      hasSeenPrompt = true;
    } else if (hasSeenPrompt) {
      // A real open→hidden transition needs no opening grace or focus cycle.
      finish({ restore: true });
    }
  };
  const onTabs = (event: vscode.TabChangeEvent) => {
    if (event.closed.some((tab) => isMirrorTab(tab, target))) {
      finish({ restore: false });
    } else {
      sample();
    }
  };
  function finish(end: EditEnd) {
    if (!isDisposed) {
      dispose();
      onEnd(end);
    }
  }
  const interval = setInterval(sample, POLL_MS);
  const subscriptions = [
    vscode.window.tabGroups.onDidChangeTabs(onTabs),
    vscode.window.onDidChangeActiveTextEditor(sample),
    { dispose: prompt.onVisibilityChanged(observePrompt) },
  ];
  function dispose() {
    if (isDisposed) {
      return;
    }
    isDisposed = true;
    leave.clear();
    clearInterval(interval);
    for (const subscription of subscriptions) {
      subscription.dispose();
    }
  }
  return { dispose };
}

/**
 * A reader's close often activates another tab first, then removes the
 * mirror; a tab switch leaves the mirror in place. Decide once that settles.
 */
function settleLeave(target: string, finish: (end: EditEnd) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    start() {
      timer ??= setTimeout(() => {
        timer = undefined;
        if (!hasMirrorTab(target)) {
          finish({ restore: false });
        } else if (hasLeftMirror(target)) {
          finish({ restore: true });
        }
      }, LEAVE_SETTLE_MS);
    },
    clear() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
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
