// The page's right-click menu: where it opens when it is asked for at the
// selection (the iPad's More…), and how big its rows are. The page's DOM is
// faked, since these tests run in Node.
import test from "node:test";
import assert from "node:assert/strict";
import { menuSpot } from "../../src/page/context-menu";
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
