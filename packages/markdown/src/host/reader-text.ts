import * as vscode from "vscode";

const KEY = "lumiere.reclaim.readerText";

/**
 * Notes the reader keeps in the text editor: a text tab that arrived and was
 * not reclaimed (a switch in place, Open as Text, asking twice). Reclaim
 * leaves them alone, including a command selection there (find, go to line,
 * an agent's jump) and a window reload. A note stops being kept once it has
 * no text tab left.
 */
class ReaderText {
  private readonly uris = new Set<string>();
  private memory: vscode.Memento | undefined;

  /** Start an activation with what the workspace state kept. */
  restore(memory: vscode.Memento | undefined): void {
    this.memory = memory;
    this.uris.clear();
    for (const uri of memory?.get<string[]>(KEY, []) ?? []) {
      this.uris.add(uri);
    }
  }

  has(uri: string): boolean {
    return this.uris.has(uri);
  }

  keep(uri: string): void {
    if (!this.uris.has(uri)) {
      this.uris.add(uri);
      this.remember();
    }
  }

  /** Stop keeping notes among `tabs` (default: all kept) with no text tab left. */
  forgetClosed(tabs?: readonly vscode.Tab[]): void {
    const candidates = tabs
      ? tabs.flatMap((tab) =>
          tab.input instanceof vscode.TabInputText
            ? [tab.input.uri.toString()]
            : [],
        )
      : [...this.uris];
    let changed = false;
    for (const uri of candidates) {
      if (this.uris.has(uri) && !hasTextTab(uri)) {
        this.uris.delete(uri);
        changed = true;
      }
    }
    if (changed) {
      this.remember();
    }
  }

  private remember(): void {
    void this.memory?.update(KEY, [...this.uris]);
  }
}

export const readerText = new ReaderText();

function hasTextTab(uri: string): boolean {
  return vscode.window.tabGroups.all.some((group) =>
    group.tabs.some(
      (tab) =>
        tab.input instanceof vscode.TabInputText &&
        tab.input.uri.toString() === uri,
    ),
  );
}
