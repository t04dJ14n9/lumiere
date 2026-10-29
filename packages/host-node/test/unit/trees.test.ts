import test from "node:test";
import assert from "node:assert/strict";
import type { TreeNode, TreeSource } from "@workshop/markdown/portable";
import { TreeHub, type TreeEvent } from "../../src/host/trees";

/** An outline: "Title" with two sections, the second with a subsection. */
function outline(): TreeSource {
  const node = (
    id: string,
    children?: TreeNode[],
  ): TreeNode & { kids?: TreeNode[] } => ({
    id,
    label: id.toUpperCase(),
    command: { id: "open", args: ["note.md", id.length] },
    ...(children ? { expanded: true, kids: children } : {}),
  });
  const roots = [node("title", [node("one"), node("two", [node("two-a")])])];
  return {
    roots: () => roots,
    children: (parent) => (parent as { kids?: TreeNode[] }).kids ?? [],
  };
}

function hub() {
  const ran: unknown[][] = [];
  const trees = new TreeHub({
    execute: async (id: string, ...args: unknown[]) => {
      ran.push([id, ...args]);
      return undefined;
    },
  });
  const events: TreeEvent[] = [];
  trees.onEvent((event) => events.push(event));
  return { trees, ran, events };
}

test("a plugin's tree is read as one nested snapshot", async () => {
  const { trees } = hub();
  const handle = trees.tree("lumiere.markdown.outline", outline());
  handle.setMessage("Two sections");
  const snapshot = await trees.snapshot("lumiere.markdown.outline");
  assert.equal(snapshot?.message, "Two sections");
  assert.equal(snapshot?.truncated, false);
  const title = snapshot?.items[0];
  assert.equal(title?.label, "TITLE");
  assert.equal(title?.expanded, true);
  assert.equal(title?.runnable, true);
  assert.deepEqual(
    title?.children?.map((item) => item.id),
    ["one", "two"],
  );
  assert.equal(
    title?.children?.[0]?.children,
    undefined,
    "a leaf has no children",
  );
  assert.deepEqual(
    title?.children?.[1]?.children?.map((item) => item.id),
    ["two-a"],
  );
  assert.deepEqual(trees.ids(), ["lumiere.markdown.outline"]);
  assert.equal(await trees.snapshot("nope"), undefined);
});

test("clicking a node runs its command with its arguments", async () => {
  const { trees, ran } = hub();
  trees.tree("outline", outline());
  assert.equal(
    await trees.run("outline", "two-a"),
    false,
    "not before a snapshot",
  );
  await trees.snapshot("outline");
  assert.equal(await trees.run("outline", "two-a"), true);
  assert.deepEqual(ran, [["open", "note.md", 5]]);
  assert.equal(await trees.run("outline", "missing"), false);
});

test("refresh, reveal and dispose reach the embedder; a disposed tree is gone", async () => {
  const { trees, events } = hub();
  const handle = trees.tree("outline", outline());
  handle.refresh();
  await handle.reveal({ id: "two", label: "TWO" }, { select: true });
  handle.dispose();
  handle.refresh();
  assert.deepEqual(events, [
    { type: "changed", viewId: "outline" },
    { type: "changed", viewId: "outline" },
    { type: "reveal", viewId: "outline", id: "two", select: true },
    { type: "changed", viewId: "outline" },
  ]);
  assert.equal(await trees.snapshot("outline"), undefined);
});

test("the embedder says whether a tree is on screen", () => {
  const { trees } = hub();
  const handle = trees.tree("outline", outline());
  const heard: boolean[] = [];
  handle.onVisibilityChanged((visible) => heard.push(visible));
  assert.equal(handle.visible, false);
  trees.setVisible("outline", true);
  trees.setVisible("outline", true);
  trees.setVisible("outline", false);
  assert.deepEqual(heard, [true, false]);
});

test("a huge tree is cut short instead of taking the host down", async () => {
  const { trees } = hub();
  const many = Array.from({ length: 6000 }, (_, index) => ({
    id: `n${index}`,
    label: `${index}`,
  }));
  trees.tree("tags", { roots: () => many, children: () => [] });
  const snapshot = await trees.snapshot("tags");
  assert.equal(snapshot?.items.length, 5000);
  assert.equal(snapshot?.truncated, true);
});

test("expand and collapse emit without a full changed refresh", async () => {
  const { trees, events } = hub();
  const handle = trees.tree("outline", outline());
  events.length = 0;
  await handle.expand({ id: "title", label: "TITLE" });
  await handle.collapse({ id: "title", label: "TITLE" });
  assert.deepEqual(events, [
    { type: "expand", viewId: "outline", id: "title" },
    { type: "collapse", viewId: "outline", id: "title" },
  ]);
  assert.equal(
    events.some((event) => event.type === "changed"),
    false,
  );
});

test("visibility set before a tree registers is preserved on the registered handle", () => {
  const { trees } = hub();
  trees.setVisible("outline", true);
  const handle = trees.tree("outline", outline());
  assert.equal(handle.visible, true);
});
