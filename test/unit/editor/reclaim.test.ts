import test from "node:test";
import assert from "node:assert/strict";
import {
  associatedWith,
  Bypass,
  Lease,
  isReclaimableNote,
  reclaimEnabled,
  shouldReclaim,
} from "../../../src/host/reclaim-policy";
import type { TabKind } from "../../../src/host/reclaim-policy";

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

test("associated notes in Cursor's input-less Markdown editor are reclaimed", () => {
  for (const before of ["none", "text", "workbench"] as const) {
    assert.equal(shouldReclaim(swap(before, "other"), context), true);
  }
  assert.equal(shouldReclaim(swap("other", "other"), context), false);
  assert.equal(
    shouldReclaim(swap("none", "other"), {
      ...context,
      associated: () => false,
    }),
    false,
  );
  assert.equal(
    shouldReclaim(swap("none", "other"), { ...context, enabled: false }),
    false,
  );
  assert.equal(
    shouldReclaim(swap("none", "other"), {
      ...context,
      bypassed: () => true,
    }),
    false,
  );
});

test("the handoff from Cursor Markdown into Workshop is left in place", () => {
  assert.equal(shouldReclaim(swap("other", "workbench"), context), false);
  assert.equal(shouldReclaim(swap("text", "workbench"), context), false);
  assert.equal(shouldReclaim(swap("workbench", "workbench"), context), false);
});

test("only notes the workspace routes to Markdown Workshop are reclaimed", () => {
  const associations = { "*.md": "markdownWorkshop.editor" };
  const viewType = "markdownWorkshop.editor";
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
    assert.equal(shouldReclaim(swap("none", "other", uri), context), false);
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
