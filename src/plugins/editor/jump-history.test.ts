import test from "node:test";
import assert from "node:assert/strict";
import {
  JumpHistory,
  mapAnchor,
  mapSourceOffset,
  type MarkdownLocation,
} from "./jump-history";

function location(
  at: number,
  top = at,
  uri = "file:///vault/Note.md",
): MarkdownLocation {
  return {
    kind: "markdown",
    uri,
    anchor: {
      selection: { anchor: at, head: at },
      scroll: { from: at, offset: -5, left: 3, top },
    },
  };
}
test("jumps preserve origins, departure scroll and both history directions", () => {
  const history = new JumpHistory();
  history.record(location(1), location(10));
  history.record(location(10), location(20));
  assert.equal(history.size, 3);
  const back = history.plan(-1, location(20, 700))!;
  assert.equal(back.location.anchor.selection.head, 10);
  assert.equal(history.canForward, false);
  assert.equal(history.commit(back), true);
  const forward = history.plan(1, location(10))!;
  assert.equal(forward.location.anchor.scroll.top, 700);
  assert.equal(history.commit(forward), true);
  assert.equal(history.canForward, false);
});
test("failed replay does not advance; a fresh jump truncates the forward branch", () => {
  const history = new JumpHistory();
  history.record(location(1), location(10));
  history.record(location(10), location(20));
  const failed = history.plan(-1, location(20))!;
  assert.equal(history.plan(-1, location(20))!.location, failed.location);
  history.commit(failed);
  history.record(location(10), location(30));
  assert.equal(history.canForward, false);
  assert.equal(history.commit(failed), false);
  assert.equal(
    history.plan(-1, location(30))!.location.anchor.selection.head,
    10,
  );
});
test("identical destinations, cross-file jumps and ordinary scroll create no entries", () => {
  const history = new JumpHistory();
  history.record(location(1), location(1, 900));
  history.record(location(1), location(10, 0, "file:///other.md"));
  assert.equal(history.size, 0);
});
test("history is bounded and split panes have independent cursors", () => {
  const left = new JumpHistory(3);
  const right = new JumpHistory(3);
  for (let i = 0; i < 8; i++) {
    left.record(location(i), location(i + 1));
  }
  right.record(location(40), location(50));
  assert.equal(left.size, 3);
  assert.equal(left.plan(-1, location(8))!.location.anchor.selection.head, 7);
  assert.equal(
    right.plan(-1, location(50))!.location.anchor.selection.head,
    40,
  );
  assert.throws(() => new JumpHistory(1));
});
test("source edits map anchors and revoke previously prepared replay plans", () => {
  const history = new JumpHistory();
  history.record(location(1), location(20));
  const stale = history.plan(-1, location(20))!;
  const changes = [{ from: 0, to: 0, insert: "a\r\n" }];
  history.map((entry) => ({
    ...entry,
    anchor: mapAnchor(entry.anchor, (at) => mapSourceOffset(at, changes)),
  }));
  assert.equal(history.commit(stale), false);
  assert.equal(
    history.plan(-1, location(23))!.location.anchor.selection.head,
    4,
  );
  assert.equal(mapSourceOffset(6, [{ from: 4, to: 8, insert: "x" }]), 5);
  assert.equal(
    mapSourceOffset(20, [
      { from: 4, to: 8, insert: "x" },
      { from: 10, to: 10, insert: "ab" },
    ]),
    19,
  );
  history.clear();
  assert.equal(history.canBack, false);
  assert.equal(history.canForward, false);
});

test("interrupted replay origin survives source mapping before the next replay", () => {
  const history = new JumpHistory();
  history.record(location(0), location(8));
  history.attempt(history.plan(-1, location(8))!);
  history.map((entry) => ({
    ...entry,
    anchor: mapAnchor(entry.anchor, (at) => at + 1),
  }));
  const retried = history.plan(-1, location(1))!;
  assert.equal(history.commit(retried), true);
  assert.equal(history.plan(1, location(1))!.location.anchor.selection.head, 9);
});
