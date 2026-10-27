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
  /**
   * The kind of the tab this one replaced in place, or `none` for a tab that
   * opened beside the others or was reused.
   */
  before: TabKind;
  after: TabKind;
}

/**
 * Whether an associated note arriving in the text or Cursor Markdown editor
 * should go back to Lumière: a switch into Cursor's own Markdown editor, and
 * a new text tab, as a chat link or a review card opens. A switch in place to
 * the text editor (Reopen Editor With…, Cursor's Markdown button) is the
 * reader asking for the text, so it stays. Diffs, Git and untitled files are
 * excluded by the tab classifier and note predicate. Notes this extension
 * opened as text stay, as does a note reclaimed a moment ago, so asking for
 * the text editor a second time keeps it.
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
    landsInNativeEditor(swap) &&
    context.isNote(swap.uri) &&
    context.associated(swap.uri) &&
    !context.bypassed(swap.uri)
  );
}

/**
 * A text tab names its note; only a new one is reclaimed, never one that
 * replaced the note's tab in place. An input-less tab is matched by its
 * label, which Cursor's plan editor and its other input-less editors share,
 * so only one that replaced the note's own tab is known to be Cursor's
 * Markdown editor.
 */
function landsInNativeEditor({ before, after }: TabSwap): boolean {
  if (after === "text") {
    return before === "none";
  }
  return after === "other" && (before === "workbench" || before === "text");
}

/** What reclaim reads from one tab. */
export interface TabFacts {
  uri: string | undefined;
  kind: TabKind;
}

/** The parts of VS Code's tab API that classify tab events. */
export interface TabModel<Tab> {
  facts(tab: Tab): TabFacts;
  groupOf(tab: Tab): {
    readonly tabs: readonly Tab[];
    readonly activeTab: Tab | undefined;
  };
  /** The active tab of the active group, the only tab a transfer acts on. */
  shownTab(): Tab | undefined;
}

export interface TabChange<Tab> {
  readonly opened: readonly Tab[];
  readonly changed: readonly Tab[];
}

/**
 * Turns tab events into swaps, judging each new tab once.
 *
 * VS Code opens a tab inactive and activates it in a later event. A switch in
 * place (Cursor's Preview | Markdown, Reopen Editor With…) opens the new tab
 * at the old tab's index while the old one is still active, activates it,
 * and closes the old one last. So a new tab is classified when it opens,
 * against the active tab of the same note right after it, and judged at its
 * first activation. Tabs are tracked as objects, which VS Code keeps for a
 * tab's lifetime: one group can hold a note twice, and a tab that was already
 * there is not arriving when it becomes active again, as it does when the
 * tab in front of it closes.
 */
export class TabSwaps<Tab extends object> {
  /** New tabs that have not been active yet. */
  private readonly unjudged = new WeakMap<Tab, TabSwap>();
  /** Swaps a Cursor Edit session kept native, judged again when it ends. */
  private readonly held = new WeakMap<Tab, TabSwap>();

  constructor(private readonly model: TabModel<Tab>) {}

  /**
   * The swaps to judge after one tab event. `endedSessions` are the notes
   * whose Cursor Edit session this event ended.
   */
  next(
    change: TabChange<Tab>,
    endedSessions: ReadonlySet<string>,
  ): { tab: Tab; swap: TabSwap }[] {
    for (const tab of change.opened) {
      this.classify(tab);
    }
    const due = this.firstActivations(change);
    const resumed = this.resumeShown(endedSessions);
    return resumed ? [...due, resumed] : due;
  }

  hold(tab: Tab, swap: TabSwap): void {
    this.held.set(tab, swap);
  }

  /**
   * Tabs already open when reclaim starts (a restored window, a note passed
   * on the command line) arrive from nowhere, as a new tab does: each is
   * judged on its first activation. The one already shown is due now.
   */
  adopt(tabs: Iterable<Tab>): { tab: Tab; swap: TabSwap }[] {
    for (const tab of tabs) {
      const { uri, kind } = this.model.facts(tab);
      if (uri !== undefined) {
        this.unjudged.set(tab, { uri, before: "none", after: kind });
      }
    }
    const shown = this.model.shownTab();
    const swap = shown === undefined ? undefined : this.unjudged.get(shown);
    if (shown === undefined || !swap) {
      return [];
    }
    this.unjudged.delete(shown);
    return [{ tab: shown, swap }];
  }

  private classify(tab: Tab): void {
    const { uri, kind } = this.model.facts(tab);
    if (uri === undefined) {
      return;
    }
    const group = this.model.groupOf(tab);
    const index = group.tabs.indexOf(tab);
    const next = index < 0 ? undefined : group.tabs[index + 1];
    const replaced =
      next !== undefined && next === group.activeTab
        ? this.model.facts(next)
        : undefined;
    const before = replaced?.uri === uri ? replaced.kind : "none";
    this.unjudged.set(tab, { uri, before, after: kind });
  }

  private firstActivations(change: TabChange<Tab>) {
    const due: { tab: Tab; swap: TabSwap }[] = [];
    for (const tab of new Set([...change.opened, ...change.changed])) {
      const swap = this.unjudged.get(tab);
      if (!swap || this.model.groupOf(tab).activeTab !== tab) {
        continue;
      }
      this.unjudged.delete(tab);
      // Activated in a group that does not have focus, as an open beside
      // that preserves focus does: the reader is elsewhere, so it stays.
      if (this.model.shownTab() === tab) {
        due.push({ tab, swap });
      }
    }
    return due;
  }

  /**
   * An Edit session ends when its last text tab leaves, after the tab that
   * replaced it is already active; the reader is still looking at that tab.
   */
  private resumeShown(endedSessions: ReadonlySet<string>) {
    const tab = this.model.shownTab();
    const swap = tab === undefined ? undefined : this.held.get(tab);
    if (tab === undefined || !swap || !endedSessions.has(swap.uri)) {
      return undefined;
    }
    this.held.delete(tab);
    return { tab, swap };
  }
}

/**
 * Whether a tab landing in the native editor during the post-reclaim hold
 * should stay native (Host GUI S6). The tab judge then promotes `textBypass`
 * so command selection reclaim — which only sees Open-as-Text / Edit leases —
 * honors the same hold. Navigation hunks after reclaim still transfer: they
 * never take this tab-skip path.
 */
export function shouldHoldNativeAfterReclaim(input: {
  recentTransfer: boolean;
  reclaimable: boolean;
}): boolean {
  return input.reclaimable && input.recentTransfer;
}

/** Cursor Markdown still needs the transfer warm even with a loaded document. */
export function shouldWarmBeforeReclaim(
  kind: TabKind,
  isDocumentOpen: boolean,
): boolean {
  return kind !== "text" || !isDocumentOpen;
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

type LeaseState = "pending" | "established";

/**
 * Each handoff holds reclaim off while pending, then promotes its own token
 * once a native editor is confirmed. Tab disappearance clears established
 * sessions only: overlapping handoffs may still be warming or opening text.
 */
export class Lease {
  private readonly owners = new Map<string, Map<symbol, LeaseState>>();

  acquire(uri: string) {
    const token = Symbol();
    const owners = this.owners.get(uri) ?? new Map<symbol, LeaseState>();
    owners.set(token, "pending");
    this.owners.set(uri, owners);
    return {
      promote: () => this.promote(uri, token),
      release: () => this.release(uri, token),
    };
  }

  /** The last native text tab is gone; pending handoffs still own their tokens. */
  clear(uri: string): void {
    const owners = this.owners.get(uri);
    if (!owners) {
      return;
    }
    for (const [token, state] of owners) {
      if (state === "established") {
        this.release(uri, token);
      }
    }
  }

  has(uri: string): boolean {
    return this.owners.has(uri);
  }

  private promote(uri: string, token: symbol): void {
    const owners = this.owners.get(uri);
    // A released or cleared token cannot revive a session or affect a retry.
    if (owners?.has(token)) {
      owners.set(token, "established");
    }
  }

  private release(uri: string, token: symbol): void {
    const owners = this.owners.get(uri);
    owners?.delete(token);
    if (owners?.size === 0) {
      this.owners.delete(uri);
    }
  }
}
