// The page's right-click menu: where it and its submenus open, what keys do
// in it, and how big its rows are. The page's DOM is faked, since these
// tests run in Node.
import test from "node:test";
import assert from "node:assert/strict";
import { menuSpot } from "../../src/page/context-menu";
import {
  menuEntries,
  menuMove,
  nextEnabled,
  submenuSpot,
  type MenuEntry,
} from "../../src/page/menu-model";
import { PAGE_STYLE } from "../../src/page/ui";

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, bottom: top + height }) as DOMRect;

function element(box: DOMRect) {
  return {
    nodeType: 1,
    getBoundingClientRect: () => box,
  } as unknown as Element;
}

function selection(start: Node, box: DOMRect) {
  return {
    rangeCount: 1,
    getRangeAt: () => ({
      startContainer: start,
      getBoundingClientRect: () => box,
    }),
  };
}

const body = element(rect(0, 0, 1000, 800));

test("the menu opens under the selection, on the element that holds it", () => {
  const line = element(rect(100, 40, 600, 24));
  const text = { nodeType: 3, parentElement: line } as unknown as Node;
  const spot = menuSpot(selection(text, rect(180, 42, 60, 20)), body);
  assert.equal(spot.target, line);
  assert.deepEqual([spot.x, spot.y], [180, 62]);
});

test("a caret with an empty rectangle opens it under its element", () => {
  const line = element(rect(100, 40, 600, 24));
  const spot = menuSpot(selection(line as Node, rect(0, 0, 0, 0)), body);
  assert.equal(spot.target, line);
  assert.deepEqual([spot.x, spot.y], [100, 64]);
});

test("with no selection it opens under the focused element", () => {
  const spot = menuSpot(
    { rangeCount: 0, getRangeAt: () => assert.fail() },
    body,
  );
  assert.equal(spot.target, body);
  assert.deepEqual([spot.x, spot.y], [0, 800]);
});

test("on a touch screen the menu's rows are tall enough for a finger", () => {
  const coarse = PAGE_STYLE.split("@media (pointer:coarse)")[1] ?? "";
  const row = /\.lumiere-page-menu \[role=menuitem\]\{([^}]*)\}/.exec(coarse);
  assert.ok(row, "a coarse-pointer rule for the menu's rows");
  assert.match(row[1] ?? "", /min-height:44px/);
  assert.match(coarse, /\.lumiere-page-menu\{[^}]*font-size:17px/);
});

test("command rows are numbered down the groups and into each submenu where it stands", () => {
  const entries = menuEntries([
    [{ label: "Copy Link for Agent" }],
    [
      {
        label: "Format",
        submenu: [[{ label: "Bold" }], [{ label: "Inline Code" }]],
      },
      { label: "Insert", submenu: [[{ label: "Link" }]] },
      { label: "Toggle Spellcheck" },
    ],
  ]);
  const format = entries[1]?.[0];
  assert.ok(format && "groups" in format);
  assert.deepEqual(
    format.groups.map((group) =>
      group.map((entry) => "run" in entry && entry.run),
    ),
    [[1], [2]],
  );
  assert.deepEqual(
    entries.flat().map((entry) => ("run" in entry ? entry.run : entry.label)),
    [0, "Format", "Insert", 4],
  );
});

test("keys move through the innermost menu, open a submenu and go back out of it", () => {
  const top = (row?: "command" | "submenu") => ({ inSubmenu: false, row });
  const inner = (row?: "command" | "submenu") => ({ inSubmenu: true, row });
  assert.equal(menuMove("ArrowDown", top()), "next");
  assert.equal(menuMove("ArrowUp", inner("command")), "previous");
  assert.equal(menuMove("ArrowRight", top("submenu")), "open");
  assert.equal(menuMove("Enter", top("submenu")), "open");
  assert.equal(menuMove("Enter", inner("command")), "choose");
  assert.equal(menuMove("ArrowLeft", inner("command")), "back");
  assert.equal(menuMove("Escape", inner()), "back");
  assert.equal(menuMove("Escape", top("command")), "close");
  // Keys the menu has no use for stay the editor's.
  assert.equal(menuMove("ArrowRight", top("command")), undefined);
  assert.equal(menuMove("ArrowLeft", top("submenu")), undefined);
  assert.equal(menuMove("Enter", top()), undefined);
  assert.equal(menuMove("a", top("command")), undefined);
});

test("moving skips disabled rows and goes round the end", () => {
  const row = (enabled: boolean): MenuEntry => ({ label: "", enabled, run: 0 });
  const rows = [row(true), row(false), row(true)];
  assert.equal(nextEnabled(rows, -1, 1), 0);
  assert.equal(nextEnabled(rows, 0, 1), 2);
  assert.equal(nextEnabled(rows, 2, 1), 0);
  assert.equal(nextEnabled(rows, 0, -1), 2);
  assert.equal(nextEnabled([row(false)], -1, 1), undefined);
});

test("a submenu opens beside its menu, level with its row, and stays inside the page", () => {
  const size = { width: 180, height: 120 };
  const spot = (
    menu: { left: number; right: number },
    rowTop: number,
    page: { width: number; height: number },
  ) =>
    submenuSpot({
      row: { left: menu.left + 5, top: rowTop, right: menu.right - 5 },
      menu: { ...menu, top: 50 },
      size,
      page,
      inset: 5,
    });
  const middle = { left: 100, right: 300 };
  assert.deepEqual(spot(middle, 90, { width: 1000, height: 800 }), {
    x: 302,
    y: 85,
  });
  // No room on the right: on the left.
  assert.deepEqual(
    spot({ left: 400, right: 600 }, 90, { width: 700, height: 800 }),
    { x: 218, y: 85 },
  );
  // Room on neither side, as on a phone: over its menu, inside the page.
  assert.deepEqual(spot(middle, 90, { width: 450, height: 800 }), {
    x: 266,
    y: 85,
  });
  // Low on the page: lifted to fit.
  assert.deepEqual(spot(middle, 150, { width: 1000, height: 200 }), {
    x: 302,
    y: 76,
  });
});
