import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { edgeVelocity } from "../../../src/webview/ui/edge-scroll";

test("edgeVelocity is zero in the middle and grows toward each edge", () => {
  assert.equal(edgeVelocity(50, 0, 100), 0);
  assert.ok(edgeVelocity(5, 0, 100) < 0);
  assert.ok(edgeVelocity(95, 0, 100) > 0);
  assert.equal(edgeVelocity(0, 0, 100), -2);
  assert.equal(edgeVelocity(100, 0, 100), 2);
});

test("edgeVelocity ignores a zero-width or inverted range", () => {
  assert.equal(edgeVelocity(10, 50, 50), 0);
  assert.equal(edgeVelocity(10, 80, 20), 0);
});

test("table selection and handles edge-scroll the table-scroll box horizontally", () => {
  const root = new URL("../../../", import.meta.url).pathname;
  const read = (relative: string) =>
    readFileSync(path.join(root, relative), "utf8");
  const selection = read("src/plugins/tables/selection.ts");
  const handles = read("src/plugins/tables/handles.ts");
  const controller = read("src/plugins/tables/controller.ts");
  const grid = read("src/plugins/tables/grid.ts");
  const edge = read("src/webview/ui/edge-scroll.ts");
  assert.match(grid, /readonly scroll: HTMLElement/);
  assert.match(grid, /this\.scroll\.className = "table-scroll"/);
  assert.match(selection, /horizontal: grid\.scroll/);
  assert.match(controller, /horizontal: this\.grid\.scroll/);
  assert.match(edge, /export interface DragViewports/);
  assert.match(handles, /DragViewports/);
  assert.match(edge, /this\.horizontal = horizontal \?\? viewport/);
  assert.match(edge, /this\.horizontal\.scrollBy/);
  assert.match(edge, /this\.viewport\.scrollBy/);
});
