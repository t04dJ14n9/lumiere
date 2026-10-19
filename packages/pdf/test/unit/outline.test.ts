import assert from "node:assert/strict";
import { test } from "node:test";
import type { OutlineItem } from "../../src/shared/messages";
import {
  findActiveOutlineItem,
  flattenOutlineForPicker,
} from "../../src/shared/outline";

const heading = (
  title: string,
  page: number,
  top?: number,
  children: OutlineItem[] = [],
): OutlineItem => ({
  title,
  page,
  ...(top === undefined ? {} : { top }),
  children,
});

test("no active bookmark for an empty tree or a position before its first destination", () => {
  const first = heading("First", 3, 100);
  assert.equal(findActiveOutlineItem([], { page: 1 }), undefined);
  assert.equal(
    findActiveOutlineItem([first], { page: 2, top: 999 }),
    undefined,
  );
  assert.equal(findActiveOutlineItem([first], { page: 3, top: 99 }), undefined);
});

test("a heading stays active across pages until the next heading, including after the final one", () => {
  const intro = heading("Introduction", 1);
  const chapter = heading("Chapter", 5);
  for (const page of [1, 2, 4]) {
    assert.equal(findActiveOutlineItem([intro, chapter], { page }), intro);
  }
  for (const page of [5, 6, 100]) {
    assert.equal(findActiveOutlineItem([intro, chapter], { page }), chapter);
  }
});

test("headings on the same page change exactly at their vertical destinations", () => {
  const first = heading("Start", 2);
  const middle = heading("Middle", 2, 120.5);
  const end = heading("End", 2, 300);
  const items = [first, middle, end];
  assert.equal(findActiveOutlineItem(items, { page: 2 }), first);
  assert.equal(findActiveOutlineItem(items, { page: 2, top: 120.4 }), first);
  assert.equal(findActiveOutlineItem(items, { page: 2, top: 120.5 }), middle);
  assert.equal(findActiveOutlineItem(items, { page: 2, top: 299 }), middle);
  assert.equal(findActiveOutlineItem(items, { page: 2, top: 300 }), end);
  assert.equal(findActiveOutlineItem(items, { page: 3 }), end);
});

test("nested headings remain active until a later sibling section begins", () => {
  const child = heading("Child", 2);
  const chapter = heading("Chapter", 1, undefined, [child]);
  const next = heading("Next chapter", 6);
  assert.equal(findActiveOutlineItem([chapter, next], { page: 1 }), chapter);
  assert.equal(findActiveOutlineItem([chapter, next], { page: 4 }), child);
  assert.equal(findActiveOutlineItem([chapter, next], { page: 6 }), next);
});

test("identical destinations prefer the deepest heading, even when a shallow sibling follows it", () => {
  const deepest = heading("Deepest", 3, 0);
  const child = heading("Child", 3, undefined, [deepest]);
  const parent = heading("Parent", 3, 0, [child]);
  assert.equal(
    findActiveOutlineItem([parent, heading("Alias", 3)], { page: 3 }),
    deepest,
  );
});

test("equal destinations at the same depth deterministically choose the later bookmark", () => {
  const first = heading("First alias", 3);
  const last = heading("Last alias", 3, 0);
  assert.equal(findActiveOutlineItem([first, last], { page: 3 }), last);
});

test("group and external entries are skipped while their local children are searched", () => {
  const local = heading("Local", 4);
  const group: OutlineItem = {
    title: "Group",
    children: [{ title: "External", children: [local] }],
  };
  assert.equal(findActiveOutlineItem([group], { page: 3 }), undefined);
  assert.equal(findActiveOutlineItem([group], { page: 4 }), local);
  assert.equal(
    findActiveOutlineItem([{ title: "External", children: [] }], { page: 10 }),
    undefined,
  );
});

test("unsorted destinations follow page and offset order without changing the bookmark tree", () => {
  const later = heading("Later", 8);
  const high = heading("High", 2, 400);
  const low = heading("Low", 2, 100);
  const items = [later, high, low];
  assert.equal(findActiveOutlineItem(items, { page: 2, top: 200 }), low);
  assert.equal(findActiveOutlineItem(items, { page: 2, top: 500 }), high);
  assert.equal(findActiveOutlineItem(items, { page: 8 }), later);
  assert.deepEqual(items, [later, high, low]);
});

test("flattenOutlineForPicker lists navigable bookmarks with page labels and ancestor detail", () => {
  const child = heading("Child", 2, 40);
  const group: OutlineItem = {
    title: "Group",
    children: [child, { title: "External", children: [] }],
  };
  const root = heading("Root", 1, undefined, [group]);
  assert.deepEqual(flattenOutlineForPicker([root]), [
    { title: "Root", page: 1, description: "p.1" },
    {
      title: "Child",
      page: 2,
      top: 40,
      description: "p.2",
      detail: "Root › Group",
    },
  ]);
  assert.deepEqual(flattenOutlineForPicker([]), []);
});
