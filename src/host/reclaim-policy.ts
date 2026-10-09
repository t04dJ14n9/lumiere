/** What a tab shows, as far as reclaiming the text editor is concerned. */
export type TabKind = "workbench" | "text" | "other" | "none";

export interface ReclaimSetting {
  mode: "auto" | "on" | "off";
  /** `vscode.env.appName`; auto mode is on only in Cursor. */
  appName: string;
}

export function reclaimEnabled({ mode, appName }: ReclaimSetting): boolean {
  if (mode === "auto") {
    return /cursor/i.test(appName);
  }
  return mode === "on";
}

export interface TabSwap {
  uri: string;
  /** The tab's kind before this change, in the same group. */
  before: TabKind;
  after: TabKind;
}

/**
 * Whether a Markdown note that just showed up in the plain text editor
 * should go back to Markdown Workbench. Cursor's Preview | Markdown switch
 * opens notes as text, and remembers that per file, so later opens arrive
 * as text too. Only notes the workspace routes to this editor are taken
 * back; diffs, Git and untitled files are never plain `file:` text tabs.
 * Notes this extension opened as text stay, as does a note reclaimed a
 * moment ago, so asking for the text editor a second time keeps it.
 */
export function shouldReclaim(
  swap: TabSwap,
  context: {
    enabled: boolean;
    isNote(uri: string): boolean;
    associated(uri: string): boolean;
    bypassed(uri: string): boolean;
  },
): boolean {
  return (
    context.enabled &&
    swap.after === "text" &&
    swap.before !== "text" &&
    context.isNote(swap.uri) &&
    context.associated(swap.uri) &&
    !context.bypassed(swap.uri)
  );
}

/** Whether `workbench.editorAssociations` sends this note to the editor. */
export function associatedWith(
  associations: unknown,
  uri: string,
  viewType: string,
): boolean {
  if (!associations || typeof associations !== "object") {
    return false;
  }
  const extension = /\.(md|markdown)$/i.exec(uri)?.[1]?.toLowerCase();
  const map = associations as Record<string, unknown>;
  return extension !== undefined && map[`*.${extension}`] === viewType;
}

/** Notes this extension may reclaim: Markdown files on disk. */
export function isReclaimableNote(uri: string): boolean {
  return /^file:/.test(uri) && /\.(md|markdown)$/i.test(uri);
}

/**
 * URIs that must keep the text editor for a short while: ones this
 * extension opened as text, and ones it just reclaimed.
 */
export class Bypass {
  private readonly until = new Map<string, number>();
  constructor(
    private readonly now: () => number = Date.now,
    private readonly window = 10_000,
  ) {}
  allow(uri: string): void {
    this.until.set(uri, this.now() + this.window);
  }
  has(uri: string): boolean {
    const until = this.until.get(uri);
    if (until === undefined) {
      return false;
    }
    if (until < this.now()) {
      this.until.delete(uri);
      return false;
    }
    return true;
  }
}
