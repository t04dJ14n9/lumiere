import assert from "node:assert/strict";
import { test } from "node:test";
import {
  STATUS_BAR_ORDER,
  statusBarPriority,
  type StatusBarEntryId,
} from "../../src/extension/plugins/pdfToolbar/status-bar-layout";

// VS Code and Cursor place right-aligned entries from the right edge in
// ascending priority and drop the leftmost first when the bar is crowded; an
// entry moves when one to its right changes width.

/** The entries right of `id`, which decide where it is. */
function rightOf(id: StatusBarEntryId): StatusBarEntryId[] {
  return STATUS_BAR_ORDER.slice(STATUS_BAR_ORDER.indexOf(id) + 1);
}

const PAGE_BUTTONS: StatusBarEntryId[] = ["previousPage", "nextPage"];
const ZOOM_BUTTONS: StatusBarEntryId[] = ["zoomOut", "zoomIn"];
const PAGE_AND_ZOOM: StatusBarEntryId[] = [
  "page",
  ...PAGE_BUTTONS,
  "zoom",
  ...ZOOM_BUTTONS,
];

test("priorities fall from left to right, one entry per place", () => {
  assert.equal(new Set(STATUS_BAR_ORDER).size, STATUS_BAR_ORDER.length);
  const priorities = STATUS_BAR_ORDER.map(statusBarPriority);
  assert.equal(new Set(priorities).size, priorities.length);
  assert.deepEqual(
    priorities,
    [...priorities].sort((a, b) => b - a),
  );
});

test("the viewer's entries are right of other extensions' and Cursor's, left of the notifications bell", () => {
  for (const id of STATUS_BAR_ORDER) {
    const priority = statusBarPriority(id);
    // Cursor's Tab and Agent Stats (98 to 100), most extensions (0), Prettier (-1).
    assert.ok(priority < -1, `${id} at ${priority}`);
    assert.ok(priority > -Number.MAX_SAFE_INTEGER, `${id} at ${priority}`);
  }
});

test("page and zoom are the last of the viewer's entries to be dropped", () => {
  for (const id of PAGE_AND_ZOOM) {
    assert.ok(rightOf("find").includes(id), id);
    assert.ok(rightOf("view").includes(id), id);
  }
});

test("zooming moves neither zoom button: no label is right of them", () => {
  // Zooming changes the zoom label, and can bring another page into view.
  for (const id of ZOOM_BUTTONS) {
    assert.ok(!rightOf(id).includes("zoom"), id);
    assert.ok(!rightOf(id).includes("page"), id);
  }
});

test("paging moves neither page button: the page label is left of them", () => {
  // Paging changes only the page label; fit zooms use the largest page.
  for (const id of PAGE_BUTTONS) {
    assert.ok(!rightOf(id).includes("page"), id);
  }
});
