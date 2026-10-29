import assert from "node:assert/strict";
import test from "node:test";
import { TreeExpansionState } from "../../../src/host/services/tree-expansion";
import type { TreeNode } from "../../../src/shared/host";

const BRANCH: TreeNode = {
  id: "chapter-one",
  label: "Chapter One",
  expanded: false,
};

test("collapsing a branch changes its tree item identity", () => {
  const state = new TreeExpansionState();
  const initiallyCollapsed = state.item(BRANCH);

  state.expand(BRANCH);
  const expanded = state.item(BRANCH);
  state.collapse(BRANCH);
  const collapsedAgain = state.item(BRANCH);

  assert.equal(initiallyCollapsed.node.expanded, false);
  assert.equal(expanded.node.expanded, true);
  assert.equal(collapsedAgain.node.expanded, false);
  assert.notEqual(
    collapsedAgain.id,
    initiallyCollapsed.id,
    "VS Code retains expansion by TreeItem.id, so an off-path collapse resets it",
  );
});
