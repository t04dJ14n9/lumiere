import test from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import type * as DiffViews from "../../../src/host/diff-views";

class TabInputTextDiff {
  constructor(
    readonly original: { toString(): string },
    readonly modified: { toString(): string },
  ) {}
}

function loadDiffViews(): typeof DiffViews {
  const loader = Module as typeof Module & {
    _load(id: string, ...args: unknown[]): unknown;
  };
  const originalLoad = loader._load;
  const vscode = { TabInputTextDiff, window: { tabGroups: { all: [] } } };
  loader._load = (id, ...args) =>
    id === "vscode" ? vscode : originalLoad.call(Module, id, ...args);
  const require = createRequire(import.meta.url);
  try {
    return require("../../../src/host/diff-views.ts") as typeof DiffViews;
  } finally {
    loader._load = originalLoad;
  }
}

const uri = (value: string) => ({ toString: () => value });

test("the native diff to close is looked up again, as Cursor replaces tab objects", () => {
  const { currentDiffTab } = loadDiffViews();
  const input = {
    original: uri("git:/a.md?HEAD"),
    modified: uri("file:/a.md"),
  };
  const diff = (group: number) => ({
    input: new TabInputTextDiff(uri("git:/a.md?HEAD"), uri("file:/a.md")),
    group: { viewColumn: group },
  });
  const other = {
    input: new TabInputTextDiff(uri("git:/b.md"), uri("file:/b.md")),
  };
  const inSecond = diff(2);
  const inFirst = diff(1);
  const groups = [
    { viewColumn: 1, tabs: [other, inFirst] },
    { viewColumn: 2, tabs: [inSecond] },
  ];
  // The reported tab's own group first, then any other.
  const found = currentDiffTab(
    { group: { viewColumn: 2 } } as never,
    input as never,
    groups as never,
  );
  assert.equal(found, inSecond);
  assert.equal(
    currentDiffTab(
      { group: { viewColumn: 3 } } as never,
      input as never,
      groups as never,
    ),
    inFirst,
  );
  assert.equal(
    currentDiffTab(
      { group: { viewColumn: 1 } } as never,
      input as never,
      [{ viewColumn: 1, tabs: [other] }] as never,
    ),
    undefined,
  );
});
