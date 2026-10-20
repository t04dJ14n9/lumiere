import test from "node:test";
import assert from "node:assert/strict";
import {
  associatedWith,
  Bypass,
  Lease,
  isReclaimableNote,
  reclaimEnabled,
  shouldReclaim,
  shouldHoldNativeAfterReclaim,
  shouldWarmBeforeReclaim,
  TabSwaps,
} from "../../../src/host/reclaim-policy";
import type {
  TabChange,
  TabKind,
  TabSwap,
} from "../../../src/host/reclaim-policy";

const note = "file:///vault/Note.md";
const context = {
  enabled: true,
  isNote: isReclaimableNote,
  associated: () => true,
  bypassed: () => false,
};
const swap = (before: TabKind, after: TabKind, uri = note) => ({
  uri,
  before,
  after,
});

test("only a materialized text tab can skip the foreground reclaim warm", () => {
  assert.equal(shouldWarmBeforeReclaim("text", true), false);
  assert.equal(shouldWarmBeforeReclaim("text", false), true);
  for (const kind of ["other", "workbench", "none"] as const) {
    assert.equal(shouldWarmBeforeReclaim(kind, true), true);
    assert.equal(shouldWarmBeforeReclaim(kind, false), true);
  }
});

test("auto reclaims only in Cursor; on and off are explicit", () => {
  assert.equal(reclaimEnabled({ mode: "auto", appName: "Cursor" }), true);
  assert.equal(
    reclaimEnabled({ mode: "auto", appName: "Visual Studio Code" }),
    false,
  );
  assert.equal(
    reclaimEnabled({ mode: "on", appName: "Visual Studio Code" }),
    true,
  );
  assert.equal(reclaimEnabled({ mode: "off", appName: "Cursor" }), false);
});

test("Cursor's switch from this editor or its own to text is reclaimed", () => {
  assert.equal(shouldReclaim(swap("workbench", "text"), context), true);
  assert.equal(shouldReclaim(swap("other", "text"), context), true);
});

test("a note Cursor remembers as text is reclaimed when it opens", () => {
  assert.equal(shouldReclaim(swap("none", "text"), context), true);
  assert.equal(shouldReclaim(swap("text", "text"), context), false);
});

test("a switch into Cursor's input-less Markdown editor is reclaimed", () => {
  for (const before of ["text", "workbench"] as const) {
    assert.equal(shouldReclaim(swap(before, "other"), context), true);
  }
  assert.equal(shouldReclaim(swap("other", "other"), context), false);
  assert.equal(
    shouldReclaim(swap("workbench", "other"), {
      ...context,
      associated: () => false,
    }),
    false,
  );
  assert.equal(
    shouldReclaim(swap("workbench", "other"), { ...context, enabled: false }),
    false,
  );
  assert.equal(
    shouldReclaim(swap("workbench", "other"), {
      ...context,
      bypassed: () => true,
    }),
    false,
  );
});

test("a new input-less tab is left alone: its label could be Cursor's plan editor", () => {
  assert.equal(shouldReclaim(swap("none", "other"), context), false);
});

test("the handoff from Cursor Markdown into Workshop is left in place", () => {
  assert.equal(shouldReclaim(swap("other", "workbench"), context), false);
  assert.equal(shouldReclaim(swap("text", "workbench"), context), false);
  assert.equal(shouldReclaim(swap("workbench", "workbench"), context), false);
});

test("only notes the workspace routes to Lumière are reclaimed", () => {
  const associations = { "*.md": "lumiere.markdown.editor" };
  const viewType = "lumiere.markdown.editor";
  assert.equal(associatedWith(associations, note, viewType), true);
  assert.equal(
    associatedWith(associations, "file:///a.markdown", viewType),
    false,
  );
  assert.equal(associatedWith(undefined, note, viewType), false);
  assert.equal(
    shouldReclaim(swap("workbench", "text"), {
      ...context,
      associated: () => false,
    }),
    false,
  );
});

test("diffs and other files are left alone", () => {
  assert.equal(shouldReclaim(swap("workbench", "none"), context), false);
  for (const uri of [
    "untitled:Note.md",
    "git:/vault/Note.md",
    "file:///a.ts",
  ]) {
    assert.equal(
      shouldReclaim(swap("workbench", "other", uri), context),
      false,
    );
  }
  assert.equal(
    shouldReclaim(swap("workbench", "text", "untitled:Untitled-1"), context),
    false,
  );
  assert.equal(
    shouldReclaim(swap("workbench", "text", "git:/vault/Note.md"), context),
    false,
  );
  assert.equal(
    shouldReclaim(swap("workbench", "text", "file:///vault/a.ts"), context),
    false,
  );
  assert.equal(
    shouldReclaim(swap("workbench", "text"), { ...context, enabled: false }),
    false,
  );
});

test("notes opened as text on purpose, or just reclaimed, keep the text editor", () => {
  let now = 0;
  const bypass = new Bypass(() => now, 10_000);
  bypass.allow(note);
  const withBypass = { ...context, bypassed: (uri: string) => bypass.has(uri) };
  assert.equal(shouldReclaim(swap("workbench", "text"), withBypass), false);
  now = 10_001;
  assert.equal(shouldReclaim(swap("workbench", "text"), withBypass), true);
});

test("a tab landing during the post-reclaim hold stays native", () => {
  // Host GUI S6: second Reopen With Text Editor within 10s → hold, and promote
  // textBypass so selection reclaim does not steal the tab.
  assert.equal(
    shouldHoldNativeAfterReclaim({ recentTransfer: true, reclaimable: true }),
    true,
  );
  assert.equal(
    shouldHoldNativeAfterReclaim({ recentTransfer: false, reclaimable: true }),
    false,
  );
  assert.equal(
    shouldHoldNativeAfterReclaim({
      recentTransfer: true,
      reclaimable: false,
    }),
    false,
  );
});

test("a pending handoff lease suppresses reclaim until released", () => {
  const lease = new Lease();
  const pending = lease.acquire(note);
  const withLease = {
    ...context,
    bypassed: (uri: string) => lease.has(uri),
  };
  assert.equal(shouldReclaim(swap("workbench", "text"), withLease), false);
  pending.release();
  assert.equal(shouldReclaim(swap("workbench", "text"), withLease), true);
});

test("overlapping tokens keep the lease until every owner releases", () => {
  const lease = new Lease();
  const first = lease.acquire(note);
  first.promote();
  const second = lease.acquire(note);
  const withLease = {
    ...context,
    bypassed: (uri: string) => lease.has(uri),
  };
  assert.equal(shouldReclaim(swap("workbench", "text"), withLease), false);
  second.release();
  assert.equal(lease.has(note), true);
  assert.equal(shouldReclaim(swap("workbench", "text"), withLease), false);
  first.release();
  assert.equal(lease.has(note), false);
  assert.equal(shouldReclaim(swap("workbench", "text"), withLease), true);
});

test("session clear preserves pending tokens until they are promoted", () => {
  const lease = new Lease();
  const established = lease.acquire(note);
  established.promote();
  const pending = lease.acquire(note);
  lease.clear(note);
  assert.equal(lease.has(note), true);
  lease.clear(note);
  assert.equal(
    lease.has(note),
    true,
    "repeated tab events must keep pending owners",
  );

  pending.promote();
  pending.promote();
  lease.clear(note);
  assert.equal(lease.has(note), false);
});

test("failed pending tokens release only themselves after session clear", () => {
  const lease = new Lease();
  lease.acquire(note).promote();
  const firstPending = lease.acquire(note);
  const secondPending = lease.acquire(note);
  lease.clear(note);
  firstPending.release();
  firstPending.release();
  assert.equal(
    lease.has(note),
    true,
    "another pending handoff still owns the URI",
  );
  secondPending.release();
  assert.equal(lease.has(note), false);
});

test("released and cleared tokens cannot revive sessions or release newer owners", () => {
  const lease = new Lease();
  const cancelled = lease.acquire(note);
  cancelled.release();
  cancelled.promote();
  assert.equal(lease.has(note), false);

  const expired = lease.acquire(note);
  expired.promote();
  lease.clear(note);
  expired.promote();
  assert.equal(lease.has(note), false);
  const retry = lease.acquire(note);
  cancelled.release();
  expired.release();
  expired.promote();
  assert.equal(lease.has(note), true);
  lease.clear(note);
  assert.equal(
    lease.has(note),
    true,
    "stale promotion must not establish the retry",
  );
  retry.release();
  assert.equal(lease.has(note), false);
});

test("clearing one URI leaves other pending and established owners alone", () => {
  const lease = new Lease();
  const other = "file:///vault/Other.md";
  lease.acquire(note).promote();
  const pending = lease.acquire(other);
  lease.acquire(other).promote();
  lease.clear(note);
  pending.release();
  assert.equal(lease.has(note), false);
  assert.equal(lease.has(other), true);
  lease.clear(other);
  assert.equal(lease.has(other), false);
});

interface FakeTab {
  readonly uri: string | undefined;
  readonly kind: TabKind;
  readonly group: FakeGroup;
}
interface FakeGroup {
  tabs: FakeTab[];
  activeTab: FakeTab | undefined;
}

/** Tab groups that report changes in the order VS Code does. */
function workbench(groupCount = 1) {
  const groups: FakeGroup[] = Array.from({ length: groupCount }, () => ({
    tabs: [],
    activeTab: undefined,
  }));
  let focused = groups[0]!;
  const swaps = new TabSwaps<FakeTab>({
    facts: (tab) => ({ uri: tab.uri, kind: tab.kind }),
    groupOf: (tab) => tab.group,
    shownTab: () => focused.activeTab,
  });
  const judged: TabSwap[] = [];
  /** Notes in a Cursor Edit session: their swaps are held, as reclaim does. */
  const leased = new Set<string>();
  const emit = (
    change: Partial<TabChange<FakeTab>>,
    endedSessions: readonly string[] = [],
  ) => {
    const due = swaps.next(
      { opened: [], changed: [], ...change },
      new Set(endedSessions),
    );
    for (const { tab, swap } of due) {
      if (leased.has(swap.uri)) {
        swaps.hold(tab, swap);
      } else {
        judged.push(swap);
      }
    }
  };
  const activate = (tab: FakeTab) => {
    tab.group.activeTab = tab;
    emit({ changed: [tab] });
  };
  /** A new tab opens inactive, right after the active one. */
  const add = (kind: TabKind, uri: string | undefined, group: FakeGroup) => {
    const tab = { uri, kind, group };
    const active = group.activeTab ? group.tabs.indexOf(group.activeTab) : -1;
    group.tabs.splice(active + 1, 0, tab);
    emit({ opened: [tab] });
    return tab;
  };
  return {
    groups,
    judged,
    leased,
    add,
    activate,
    focus(group: FakeGroup) {
      focused = group;
    },
    open(kind: TabKind, uri = note, group = groups[0]!) {
      const tab = add(kind, uri, group);
      activate(tab);
      return tab;
    },
    /**
     * Cursor's Preview | Markdown switch and Reopen Editor With… replace the
     * active tab: the new tab opens at its index, becomes active, and the old
     * tab closes last, which is when a Cursor Edit session can end.
     */
    switchTo(kind: TabKind, old: FakeTab, { endsSession = false } = {}) {
      const group = old.group;
      const tab = { uri: old.uri, kind, group };
      group.tabs.splice(group.tabs.indexOf(old), 0, tab);
      emit({ opened: [tab] });
      activate(tab);
      group.tabs.splice(group.tabs.indexOf(old), 1);
      if (endsSession && old.uri) {
        leased.delete(old.uri);
      }
      emit({}, endsSession && old.uri ? [old.uri] : []);
      return tab;
    },
    /** Closing the active tab activates a neighbour before removing it. */
    close(tab: FakeTab) {
      const group = tab.group;
      if (group.activeTab === tab) {
        const neighbour = group.tabs.find((candidate) => candidate !== tab);
        group.activeTab = neighbour;
        if (neighbour) {
          emit({ changed: [neighbour] });
        }
      }
      group.tabs.splice(group.tabs.indexOf(tab), 1);
      emit({});
    },
  };
}

test("a new tab is judged once, at its first activation", () => {
  const tabs = workbench();
  const text = tabs.add("text", note, tabs.groups[0]!);
  assert.deepEqual(tabs.judged, [], "VS Code opens a tab before activating it");
  tabs.activate(text);
  assert.deepEqual(tabs.judged, [swap("none", "text")]);
  tabs.activate(text);
  assert.equal(tabs.judged.length, 1, "later updates are not arrivals");
});

test("Cursor's Preview | Markdown switch is classified against the tab it replaces", () => {
  const tabs = workbench();
  const workshop = tabs.open("workbench");
  const markdown = tabs.switchTo("other", workshop);
  tabs.switchTo("text", markdown);
  assert.deepEqual(tabs.judged, [
    swap("none", "workbench"),
    swap("workbench", "other"),
    swap("other", "text"),
  ]);
});

test("closing a Workshop tab beside a Cursor Markdown tab of the same note judges nothing", () => {
  const tabs = workbench();
  tabs.switchTo("other", tabs.open("workbench"));
  for (let attempt = 0; attempt < 3; attempt++) {
    // Reclaim's openWith, or the reader, opens the note in Workshop again.
    const workshop = tabs.open("workbench");
    const judged = tabs.judged.length;
    tabs.close(workshop);
    assert.equal(
      tabs.judged.length,
      judged,
      "the Cursor Markdown tab was already there",
    );
  }
});

test("a tab opened beside the active tab of the same note is new, not a switch", () => {
  const tabs = workbench();
  tabs.open("workbench");
  tabs.open("text");
  assert.deepEqual(tabs.judged.at(-1), swap("none", "text"));
});

test("a tab first activated in a group without focus is never judged", () => {
  const tabs = workbench(2);
  const beside = tabs.open("text", note, tabs.groups[1]);
  assert.deepEqual(tabs.judged, []);
  tabs.focus(tabs.groups[1]!);
  tabs.activate(beside);
  assert.deepEqual(tabs.judged, []);
});

test("tabs that name no note are not classified", () => {
  const tabs = workbench();
  const unnamed = tabs.add("text", undefined, tabs.groups[0]!);
  tabs.activate(unnamed);
  tabs.switchTo("other", unnamed);
  assert.deepEqual(tabs.judged, []);
});

test("a switch held by a Cursor Edit session is judged when that session's text tab closes", () => {
  const tabs = workbench();
  const text = tabs.open("text");
  tabs.leased.add(note);
  tabs.switchTo("other", text, { endsSession: true });
  assert.deepEqual(tabs.judged, [swap("none", "text"), swap("text", "other")]);
});

test("a held swap stays held when its session ends some other way", () => {
  const tabs = workbench();
  tabs.leased.add(note);
  const text = tabs.open("text");
  // A failed handoff releases its own lease token; no tab change ends it.
  tabs.leased.delete(note);
  tabs.activate(text);
  assert.deepEqual(tabs.judged, []);
});

test("tabs open before reclaim starts are judged: the shown one now, the rest when first activated", () => {
  // A restored window: a note shown as text, another note behind it, and a
  // note already in Lumière.
  const group: FakeGroup = { tabs: [], activeTab: undefined };
  const shown: FakeTab = { uri: note, kind: "text", group };
  const behind: FakeTab = {
    uri: "file:///vault/Other.md",
    kind: "text",
    group,
  };
  const workshop: FakeTab = {
    uri: "file:///vault/Third.md",
    kind: "workbench",
    group,
  };
  group.tabs.push(shown, behind, workshop);
  group.activeTab = shown;
  const swaps = new TabSwaps<FakeTab>({
    facts: (tab) => ({ uri: tab.uri, kind: tab.kind }),
    groupOf: (tab) => tab.group,
    shownTab: () => group.activeTab,
  });
  const due = swaps.adopt(group.tabs);
  assert.deepEqual(
    due.map(({ swap }) => swap),
    [swap("none", "text")],
  );
  assert.equal(shouldReclaim(due[0]!.swap, context), true);
  // The note behind it is judged when the reader first opens it, once.
  group.activeTab = behind;
  const next = swaps.next({ opened: [], changed: [behind] }, new Set());
  assert.deepEqual(
    next.map(({ swap }) => swap),
    [swap("none", "text", "file:///vault/Other.md")],
  );
  assert.deepEqual(
    swaps.next({ opened: [], changed: [behind] }, new Set()),
    [],
  );
  // A tab already in Lumière is never reclaimed.
  group.activeTab = workshop;
  const kept = swaps.next({ opened: [], changed: [workshop] }, new Set());
  assert.equal(shouldReclaim(kept[0]!.swap, context), false);
});
