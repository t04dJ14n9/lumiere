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

test("the handoff from Cursor Markdown into Workbench is left in place", () => {
  assert.equal(shouldReclaim(swap("other", "workbench"), context), false);
  assert.equal(shouldReclaim(swap("text", "workbench"), context), false);
  assert.equal(shouldReclaim(swap("workbench", "workbench"), context), false);
});

test("only notes the workspace routes to Markdown Workbench are reclaimed", () => {
  const associations = { "*.md": "markdownWorkbench.editor" };
  const viewType = "markdownWorkbench.editor";
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

test("a handoff lease suppresses reclaim until released", () => {
  const lease = new Lease();
  lease.acquire(note);
  const withLease = {
    ...context,
    bypassed: (uri: string) => lease.has(uri),
  };
  assert.equal(shouldReclaim(swap("workbench", "text"), withLease), false);
  lease.release(note);
  assert.equal(shouldReclaim(swap("workbench", "text"), withLease), true);
});

test("overlapping acquires keep the lease until every release and clear drops all", () => {
  const lease = new Lease();
  lease.acquire(note);
  lease.acquire(note);
  const withLease = {
    ...context,
    bypassed: (uri: string) => lease.has(uri),
  };
  assert.equal(shouldReclaim(swap("workbench", "text"), withLease), false);
  lease.release(note);
  assert.equal(lease.has(note), true);
  assert.equal(shouldReclaim(swap("workbench", "text"), withLease), false);
  lease.release(note);
  assert.equal(lease.has(note), false);
  assert.equal(shouldReclaim(swap("workbench", "text"), withLease), true);

  lease.acquire(note);
  lease.acquire(note);
  lease.clear(note);
  assert.equal(lease.has(note), false);
  lease.release(note);
  assert.equal(lease.has(note), false);
});
