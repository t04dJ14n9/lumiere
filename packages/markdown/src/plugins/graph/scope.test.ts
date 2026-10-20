import test from "node:test";
import assert from "node:assert/strict";
import { vaultWideBundle, withVaultWideChoices } from "./choose";
import {
  collectBundle,
  indexCompleteness,
  PARTIAL_FILE_COUNT,
} from "./collect";
import { selectScope } from "./scope";
import type { OkfBundle } from "../okfCore/api";
import type { GraphNote } from "./project";

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

test('vault-wide choices prepend Whole vault without duplicating root ""', () => {
  const vault = { index: { root: "/vault" } };
  const wide = vaultWideBundle(vault);
  assert.equal(wide.root, "");
  assert.equal(wide.name, "Whole vault");
  const withOkf = withVaultWideChoices([vault], [bundle("notes")]);
  assert.equal(withOkf[0]?.root, "");
  assert.equal(withOkf[0]?.name, "Whole vault");
  assert.equal(withOkf.length, 2);
  const again = withVaultWideChoices([vault], [wide, bundle("notes")]);
  assert.equal(again.filter((item) => item.root === "").length, 1);
});

test("collectBundle with empty root includes every markdown note in the vault", () => {
  const notesByPath = new Map<string, GraphNote["metadata"]>([
    ["a.md", undefined],
    ["bundle/b.md", undefined],
    ["pic.png", undefined],
  ]);
  const vault = {
    index: {
      files: () =>
        [...notesByPath.keys()].map((path) => ({
          path,
          extension: path.endsWith(".md") ? "md" : "png",
        })),
      metadata: (path: string) => notesByPath.get(path),
    },
  };
  const collected = collectBundle(vault as never, "");
  assert.deepEqual(collected.notes.map((note) => note.path).sort(), [
    "a.md",
    "bundle/b.md",
  ]);
  const nested = collectBundle(vault as never, "bundle");
  assert.deepEqual(
    nested.notes.map((note) => note.path),
    ["bundle/b.md"],
  );
});

test("only Whole vault in choices is used when nothing is open yet", () => {
  const wide = vaultWideBundle({ index: { root: "/vault" } });
  assert.deepEqual(
    selectScope({
      explicit: false,
      hasCurrent: false,
      ambiguous: true,
      choices: [wide],
    }),
    { kind: "use", bundle: wide },
  );
});
