import assert from "node:assert/strict";
import { test } from "node:test";
import { JumpHistory, MAX_JUMP_HISTORY_ENTRIES } from "../../src/shared/jump-history";

interface Stop {
  kind: "pdf";
  uri: string;
  paneId: string;
  anchor: { page: number; top: number; left: number };
}

function stop(page: number, top = 0, uri = "file:///paper.pdf", paneId = "pane-1"): Stop {
  return { kind: "pdf", uri, paneId, anchor: { page, top, left: 0 } };
}

function history(capacity = MAX_JUMP_HISTORY_ENTRIES): JumpHistory<Stop> {
  return new JumpHistory({
    equals: (a, b) => a.kind === b.kind && a.uri === b.uri && a.paneId === b.paneId &&
      a.anchor.page === b.anchor.page && a.anchor.top === b.anchor.top && a.anchor.left === b.anchor.left,
    clone: entry => ({ ...entry, anchor: { ...entry.anchor } }),
    capacity,
  });
}

function backTo(h: JumpHistory<Stop>, expected: Stop): void {
  const replay = h.prepareBack();
  assert.ok(replay);
  assert.deepEqual(replay.target, expected);
  assert.equal(h.commit(replay.token), true);
  assert.deepEqual(h.current, expected);
}

function forwardTo(h: JumpHistory<Stop>, expected: Stop): void {
  const replay = h.prepareForward();
  assert.ok(replay);
  assert.deepEqual(replay.target, expected);
  assert.equal(h.commit(replay.token), true);
  assert.deepEqual(h.current, expected);
}

test("an empty session has no replay; its first jump saves both origin and destination", () => {
  const h = history();
  assert.equal(h.size, 0);
  assert.equal(h.current, undefined);
  assert.equal(h.canGoBack, false);
  assert.equal(h.canGoForward, false);
  assert.equal(h.prepareBack(), undefined);
  assert.equal(h.prepareForward(), undefined);
  assert.equal(h.record(stop(1), stop(5)), true);
  assert.equal(h.size, 2);
  assert.deepEqual(h.current, stop(5));
  assert.equal(h.canGoBack, true);
  assert.equal(h.canGoForward, false);
});

test("a jump without a known origin starts at its destination", () => {
  const h = history();
  assert.equal(h.record(undefined, stop(5)), true);
  assert.equal(h.size, 1);
  assert.deepEqual(h.current, stop(5));
  assert.equal(h.prepareBack(), undefined);
  h.record(stop(5), stop(9));
  backTo(h, stop(5));
});

test("an identical initial origin and destination make only one stop", () => {
  const h = history();
  assert.equal(h.record(stop(1), stop(1)), false);
  assert.equal(h.size, 1);
  assert.equal(h.canGoBack, false);
  assert.deepEqual(h.current, stop(1));
});

test("back and forward leave the cursor still until their single-use token is committed", () => {
  const h = history();
  h.record(stop(1), stop(5));
  const back = h.prepareBack();
  assert.ok(back);
  assert.deepEqual(back.target, stop(1));
  assert.deepEqual(h.current, stop(5));
  assert.equal(h.canGoBack, true);
  assert.equal(h.canGoForward, false);
  assert.equal(h.commit(back.token), true);
  assert.equal(h.commit(back.token), false);
  assert.equal(h.cancel(back.token), false);
  assert.equal(h.canGoBack, false);
  assert.equal(h.canGoForward, true);
  const forward = h.prepareForward();
  assert.ok(forward);
  assert.deepEqual(forward.target, stop(5));
  assert.deepEqual(h.current, stop(1));
  assert.equal(h.commit(forward.token), true);
  assert.deepEqual(h.current, stop(5));
  assert.equal(h.size, 2);
});

test("back and forward capture intervening scrolling without extra stops", () => {
  const h = history();
  h.record(stop(1), stop(5));
  const back = h.prepareBack(stop(6, 0.4));
  assert.ok(back);
  assert.equal(h.size, 2);
  assert.deepEqual(h.current, stop(6, 0.4));
  h.commit(back.token);
  const forward = h.prepareForward(stop(2, 0.7));
  assert.ok(forward);
  assert.deepEqual(forward.target, stop(6, 0.4));
  h.commit(forward.token);
  assert.equal(h.size, 2);
  backTo(h, stop(2, 0.7));
});

test("a new explicit jump refreshes its departing stop instead of recording reading motion", () => {
  const h = history();
  h.record(stop(1), stop(5));
  h.record(stop(7, 0.5), stop(20));
  assert.equal(h.size, 3);
  backTo(h, stop(7, 0.5));
  backTo(h, stop(1));
});

test("a new jump after going back replaces the forward branch", () => {
  const h = history();
  h.record(stop(1), stop(5));
  h.record(stop(5), stop(9));
  backTo(h, stop(5));
  h.record(stop(5, 0.25), stop(12));
  assert.equal(h.size, 3);
  assert.equal(h.canGoForward, false);
  backTo(h, stop(5, 0.25));
  forwardTo(h, stop(12));
  assert.equal(h.prepareForward(), undefined);
});

test("a repeated identical destination does not duplicate a stop or discard the forward branch", () => {
  const h = history();
  h.record(stop(1), stop(5));
  h.record(stop(5), stop(9));
  backTo(h, stop(5));
  assert.equal(h.record(stop(5), stop(5)), false);
  assert.equal(h.record(undefined, stop(5)), false);
  assert.equal(h.size, 3);
  assert.equal(h.canGoForward, true);
  forwardTo(h, stop(9));
});

test("only adjacent duplicates are avoided; revisiting an older destination is a real jump", () => {
  const h = history();
  h.record(stop(1), stop(5));
  h.record(stop(5), stop(1));
  assert.equal(h.size, 3);
  backTo(h, stop(5));
  backTo(h, stop(1));
});

test("the caller's equality distinguishes both documents and split panes", () => {
  const h = history();
  const first = stop(1);
  const split = stop(1, 0, first.uri, "pane-2");
  const other = stop(1, 0, "file:///another.pdf", "pane-3");
  h.record(first, split);
  h.record(split, other);
  assert.equal(h.size, 3);
  backTo(h, split);
  backTo(h, first);
  forwardTo(h, split);
  forwardTo(h, other);
});

test("canceling a failed replay preserves its cursor and refreshed departure point", () => {
  const h = history();
  h.record(stop(1), stop(5));
  const replay = h.prepareBack(stop(6, 0.4));
  assert.ok(replay);
  assert.equal(h.cancel(replay.token), true);
  assert.equal(h.cancel(replay.token), false);
  assert.equal(h.commit(replay.token), false);
  assert.deepEqual(h.current, stop(6, 0.4));
  assert.equal(h.canGoForward, false);
  assert.equal(h.canGoBack, true);
  assert.equal(h.size, 2);
  backTo(h, stop(1));
  forwardTo(h, stop(6, 0.4));
});

test("commit saves a cloned actual destination after the host clamps or reopens the target", () => {
  const h = history();
  h.record(stop(100), stop(5));
  const replay = h.prepareBack();
  assert.ok(replay);
  assert.deepEqual(replay.target, stop(100));
  const actual = stop(20, 0, "file:///paper.pdf", "reopened-pane");
  assert.equal(h.commit(replay.token, actual), true);
  actual.anchor.page = 999;
  assert.deepEqual(h.current, stop(20, 0, "file:///paper.pdf", "reopened-pane"));
  forwardTo(h, stop(5));
  backTo(h, stop(20, 0, "file:///paper.pdf", "reopened-pane"));
});

test("a stale replay cannot overwrite its target with a late actual destination", () => {
  const h = history();
  h.record(stop(1), stop(5));
  const stale = h.prepareBack();
  const latest = h.prepareBack();
  assert.ok(stale);
  assert.ok(latest);
  assert.equal(h.commit(stale.token, stop(999)), false);
  assert.equal(h.commit(latest.token), true);
  assert.deepEqual(h.current, stop(1));
});

test("a newer replay supersedes the old token, whose commit and cancel cannot affect it", () => {
  const h = history();
  h.record(stop(1), stop(5));
  h.record(stop(5), stop(9));
  const stale = h.prepareBack();
  const latest = h.prepareBack();
  assert.ok(stale);
  assert.ok(latest);
  assert.notEqual(stale.token, latest.token);
  assert.equal(h.commit(stale.token), false);
  assert.equal(h.cancel(stale.token), false);
  assert.deepEqual(h.current, stop(9));
  assert.equal(h.commit(latest.token), true);
  assert.deepEqual(h.current, stop(5));
});

test("recording a new jump invalidates an outstanding replay", () => {
  const h = history();
  h.record(stop(1), stop(5));
  const replay = h.prepareBack();
  assert.ok(replay);
  h.record(stop(5), stop(9));
  assert.equal(h.commit(replay.token), false);
  assert.deepEqual(h.current, stop(9));
  backTo(h, stop(5));
});

test("refresh updates only the current stop and invalidates outstanding replay", () => {
  const h = history();
  h.refresh(stop(1));
  assert.equal(h.size, 0);
  h.record(stop(1), stop(5));
  const replay = h.prepareBack();
  assert.ok(replay);
  h.refresh(stop(6, 0.3));
  assert.equal(h.size, 2);
  assert.equal(h.commit(replay.token), false);
  assert.deepEqual(h.current, stop(6, 0.3));
  backTo(h, stop(1));
  forwardTo(h, stop(6, 0.3));
});

test("an unavailable replay does not move the cursor and supersedes a pending request", () => {
  const h = history();
  h.record(stop(1), stop(5));
  const replay = h.prepareBack();
  assert.ok(replay);
  assert.equal(h.prepareForward(), undefined);
  assert.equal(h.commit(replay.token), false);
  assert.deepEqual(h.current, stop(5));
  backTo(h, stop(1));
  assert.equal(h.prepareBack(), undefined);
  assert.deepEqual(h.current, stop(1));
});

test("tokens from another session or an unknown caller cannot commit or cancel a replay", () => {
  const a = history();
  const b = history();
  a.record(stop(1), stop(5));
  b.record(stop(1), stop(5));
  const fromA = a.prepareBack();
  const fromB = b.prepareBack();
  assert.ok(fromA);
  assert.ok(fromB);
  assert.equal(a.commit(fromB.token), false);
  assert.equal(a.cancel(fromB.token), false);
  assert.equal(a.commit(Symbol("jump-history-replay")), false);
  assert.equal(a.commit(fromA.token), true);
  assert.deepEqual(b.current, stop(5));
});

test("all stored and exposed entries are defensively copied, including nested anchors", () => {
  const h = history();
  const origin = stop(1);
  const destination = stop(5);
  h.record(origin, destination);
  origin.anchor.page = 100;
  destination.anchor.page = 100;
  const current = h.current;
  assert.ok(current);
  current.anchor.page = 100;
  const back = h.prepareBack();
  assert.ok(back);
  assert.deepEqual(back.target, stop(1));
  back.target.anchor.page = 100;
  assert.equal(h.commit(back.token), true);
  assert.deepEqual(h.current, stop(1));
  forwardTo(h, stop(5));
  const refreshed = stop(6, 0.4);
  h.refresh(refreshed);
  refreshed.anchor.page = 100;
  assert.deepEqual(h.current, stop(6, 0.4));
  const departure = stop(7, 0.5);
  const replay = h.prepareBack(departure);
  assert.ok(replay);
  departure.anchor.page = 100;
  h.commit(replay.token);
  forwardTo(h, stop(7, 0.5));
});

test("the default host-session cap retains only the newest 100 stops", () => {
  const h = history();
  h.record(stop(1), stop(2));
  for (let page = 3; page <= 150; page++) h.record(stop(page - 1), stop(page));
  assert.equal(h.size, 100);
  for (let page = 149; page >= 51; page--) backTo(h, stop(page));
  assert.equal(h.canGoBack, false);
  assert.equal(h.prepareBack(), undefined);
  assert.deepEqual(h.current, stop(51));
  for (let page = 52; page <= 150; page++) forwardTo(h, stop(page));
  assert.equal(h.canGoForward, false);
});

test("a smaller cap evicts the oldest entries and remains correct after branching", () => {
  const h = history(3);
  h.record(stop(1), stop(2));
  h.record(stop(2), stop(3));
  h.record(stop(3), stop(4));
  assert.equal(h.size, 3);
  backTo(h, stop(3));
  backTo(h, stop(2));
  assert.equal(h.prepareBack(), undefined);
  h.record(stop(2), stop(8));
  h.record(stop(8), stop(9));
  h.record(stop(9), stop(10));
  assert.equal(h.size, 3);
  backTo(h, stop(9));
  backTo(h, stop(8));
  assert.equal(h.prepareBack(), undefined);
});

test("a one-entry cap stores the latest destination without replay", () => {
  const h = history(1);
  h.record(stop(1), stop(2));
  assert.equal(h.size, 1);
  assert.deepEqual(h.current, stop(2));
  assert.equal(h.prepareBack(), undefined);
  assert.equal(h.prepareForward(), undefined);
});

test("capacity must be a positive integer within the hard session limit", () => {
  for (const capacity of [0, -1, 1.5, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => history(capacity), RangeError);
  }
});

test("the model works with non-PDF primitive entries and caller-defined equality", () => {
  const h = new JumpHistory<string>({ equals: (a, b) => a.toLowerCase() === b.toLowerCase(), clone: value => value });
  assert.equal(h.record("one", "ONE"), false);
  assert.equal(h.record("one", "two"), true);
  const replay = h.prepareBack();
  assert.ok(replay);
  assert.equal(replay.target, "one");
  h.commit(replay.token);
  assert.equal(h.current, "one");
});

test("a replay cancelled after movement retains the original Forward destination", () => {
  const h = history();
  h.record(stop(1), stop(8));
  const interrupted = h.prepareBack(stop(8))!;
  h.cancel(interrupted.token);
  // The viewer moved to page 1 before cancellation reached the host.
  const retried = h.prepareBack(stop(1))!;
  h.commit(retried.token);
  assert.deepEqual(h.prepareForward(stop(1))!.target, stop(8));
});

test("a proven unstarted replay can release its departure for later ordinary reading", () => {
  const h = history(); h.record(stop(1), stop(8));
  const rejected = h.prepareBack(stop(8))!; h.cancel(rejected.token);
  h.releaseDeparture();
  const retry = h.prepareBack(stop(10))!; h.commit(retry.token);
  assert.deepEqual(h.prepareForward(stop(1))!.target, stop(10));
});
