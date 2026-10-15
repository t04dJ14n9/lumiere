/** `other` is Cursor's Markdown editor, which exposes no public tab input. */
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
 * Whether an associated note arriving in the text or Cursor Markdown editor
 * should go back to Markdown Workshop. Cursor remembers that choice per
 * file, so later opens can arrive in either editor. Diffs, Git and untitled
 * files are excluded by the tab classifier and note predicate.
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
    (swap.after === "text" || swap.after === "other") &&
    swap.before !== swap.after &&
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

/**
 * Holds reclaim off for a URI until every overlapping handoff releases and
 * (via clear) until the last native text tab for that URI is gone. Used by
 * cursorBridge so an open Cursor Edit session is never yanked by a timed
 * bypass expiry or by a failed same-URI retry.
 */
export class Lease {
  private readonly counts = new Map<string, number>();
  acquire(uri: string): void {
    this.counts.set(uri, (this.counts.get(uri) ?? 0) + 1);
  }
  /** Drop one overlapping acquisition; the URI stays leased while count > 0. */
  release(uri: string): void {
    const count = this.counts.get(uri);
    if (count === undefined) {
      return;
    }
    if (count <= 1) {
      this.counts.delete(uri);
      return;
    }
    this.counts.set(uri, count - 1);
  }
  /** Drop every acquisition (last native TabInputText for the URI is gone). */
  clear(uri: string): void {
    this.counts.delete(uri);
  }
  has(uri: string): boolean {
    return (this.counts.get(uri) ?? 0) > 0;
  }
}
