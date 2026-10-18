import * as vscode from "vscode";

const ARM_GRACE_MS = 500;
const POLL_MS = 250;
const MIN_RETURNED_LINES = 1;

interface MirrorViewport {
  editor: vscode.TextEditor;
  version: number;
  firstLine: number;
  lastLine: number;
  capacity: number;
}

/**
 * Cursor returns a prompt id at open, with no public completion event or way
 * to read its prompt/diff context keys. Observe only passive public signals.
 */
export function watchCursorEditEnd(
  uri: string,
  onEnd: () => void,
): { dispose(): void } {
  const target = vscode.Uri.parse(uri).toString();
  const armedAt = Date.now();
  const promptFocus = new EditFocusReturn();
  const chrome = new EditChromeReturn();
  let isDisposed = false;
  const sample = () => {
    if (isDisposed || Date.now() - armedAt < ARM_GRACE_MS) {
      return;
    }
    if (hasMirrorTab(target) && !hasLeftMirror(target)) {
      if (
        !promptFocus.hasReturned(target) &&
        !chrome.hasReturned(mirrorViewport(target), Date.now())
      ) {
        return;
      }
    }
    dispose();
    onEnd();
  };
  const interval = setInterval(sample, POLL_MS);
  const subscriptions = [
    vscode.window.tabGroups.onDidChangeTabs(sample),
    vscode.window.onDidChangeActiveTextEditor(sample),
    vscode.window.onDidChangeTextEditorVisibleRanges(sample),
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

/** Only observations after grace can arm a prompt-focus/return cycle. */
class EditFocusReturn {
  private isArmed = false;

  hasReturned(uri: string): boolean {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (!tab || !isMirrorTab(tab, uri)) {
      return false;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      // Keep waiting while the prompt owns focus, including on short notes
      // whose visible ranges never change. Returning to text completes it.
      this.isArmed = true;
      return false;
    }
    return this.isArmed && editor.document.uri.toString() === uri;
  }
}

function mirrorViewport(uri: string): MirrorViewport | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.toString() !== uri) {
    return undefined;
  }
  const extent = visibleLineExtent(editor.visibleRanges);
  if (!extent) {
    return undefined;
  }
  return {
    editor,
    version: editor.document.version,
    ...extent,
  };
}

function visibleLineExtent(ranges: readonly vscode.Range[]) {
  let firstLine = Infinity;
  let lastLine = -1;
  let capacity = 0;
  const ordered = [...ranges].sort((a, b) => a.start.line - b.start.line);
  for (const range of ordered) {
    firstLine = Math.min(firstLine, range.start.line);
    // Count visible source lines once, excluding folded/inline-diff gaps.
    capacity += Math.max(
      0,
      range.end.line - Math.max(range.start.line, lastLine + 1) + 1,
    );
    lastLine = Math.max(lastLine, range.end.line);
  }
  return capacity > 0 ? { firstLine, lastLine, capacity } : undefined;
}

/** An anchored expansion must survive a whole poll, not just a range event. */
class EditChromeReturn {
  private baseline: MirrorViewport | undefined;
  private returnedAt: number | undefined;

  hasReturned(viewport: MirrorViewport | undefined, now: number): boolean {
    const baseline = this.baseline;
    if (!viewport || !baseline || !comparableViewport(baseline, viewport)) {
      this.baseline = viewport;
      this.returnedAt = undefined;
      return false;
    }
    const growth = viewport.capacity - baseline.capacity;
    if (growth < MIN_RETURNED_LINES) {
      this.returnedAt = undefined;
      // A larger prompt or a pending diff may consume more room. Keep waiting
      // for the original capacity to return rather than adopting that dip.
      return false;
    }
    if (this.returnedAt === undefined) {
      this.returnedAt = now;
    }
    return now - this.returnedAt >= POLL_MS;
  }
}

function comparableViewport(
  previous: MirrorViewport,
  next: MirrorViewport,
): boolean {
  return (
    previous.editor === next.editor &&
    previous.version === next.version &&
    (previous.firstLine === next.firstLine ||
      previous.lastLine === next.lastLine)
  );
}
