import test from "node:test";
import assert from "node:assert/strict";
import { indexCompleteness, PARTIAL_FILE_COUNT } from "./collect";
import { selectScope } from "./scope";
import type { OkfBundle } from "../okfCore/api";

const bundle = (root: string): OkfBundle => ({
  id: `vault:${root}`,
  name: root || "vault",
  root,
  vaultRoot: "/vault",
});

test("an open graph keeps its bundle until the user asks", () => {
  const current = bundle("notes");
  assert.equal(
    selectScope({
      explicit: false,
      hasCurrent: true,
      ambiguous: true,
      choices: [current, bundle("other")],
    }).kind,
    "keep",
  );
});

test("a note inside one bundle is that bundle, without a workspace guess", () => {
  const owner = bundle("metrics");
  const decision = selectScope({
    explicit: false,
    hasCurrent: false,
    ambiguous: false,
    owner,
    choices: [owner, bundle("other")],
  });
  assert.deepEqual(decision, { kind: "use", bundle: owner });
});

test("an ambiguous note asks, and an empty vault does not invent a root", () => {
  assert.equal(
    selectScope({
      explicit: false,
      hasCurrent: false,
      ambiguous: true,
      choices: [bundle("a"), bundle("b")],
    }).kind,
    "ask",
  );
  assert.deepEqual(
    selectScope({
      explicit: false,
      hasCurrent: false,
      ambiguous: true,
      choices: [],
    }),
    { kind: "empty" },
  );
});

test("choosing a bundle asks even when only one bundle exists", () => {
  assert.equal(
    selectScope({
      explicit: true,
      hasCurrent: true,
      ambiguous: false,
      owner: bundle("only"),
      choices: [bundle("only")],
    }).kind,
    "ask",
  );
});

test("one unambiguous bundle is used when nothing is open yet", () => {
  const only = bundle("only");
  assert.deepEqual(
    selectScope({
      explicit: false,
      hasCurrent: false,
      ambiguous: true,
      choices: [only],
    }),
    { kind: "use", bundle: only },
  );
});

test("index completeness distinguishes a full vault from a missing parse", () => {
  assert.equal(indexCompleteness(PARTIAL_FILE_COUNT, false), "partial");
  assert.equal(indexCompleteness(3, true), "indexing");
  assert.equal(indexCompleteness(3, false), "ready");
});
