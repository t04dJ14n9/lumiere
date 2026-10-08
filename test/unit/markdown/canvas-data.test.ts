import test from "node:test";
import assert from "node:assert/strict";
import {
  canvasData,
  edgeCurve,
  edgePoint,
  type CanvasNode,
} from "../../../src/markdown/search/canvas";

const node: CanvasNode = {
  id: "one",
  type: "text",
  text: "hello",
  x: 0,
  y: 0,
  width: 100,
  height: 50,
};

test("canvas validation rejects duplicate identities and invalid node payloads", () => {
  assert.deepEqual(canvasData("{}"), { nodes: [], edges: [] });
  assert.deepEqual(canvasData(JSON.stringify({ nodes: [node] })).nodes, [node]);
  for (const nodes of [
    [node, node],
    [{ ...node, width: 0 }],
    [{ ...node, text: undefined }],
    [{ ...node, subpath: "heading" }],
    [{ ...node, backgroundStyle: "stretch" }],
  ]) {
    assert.throws(() => canvasData(JSON.stringify({ nodes })));
  }
});

test("canvas edges require existing endpoints and valid side/end metadata", () => {
  const edge = { id: "edge", fromNode: "one", toNode: "one" };
  assert.equal(
    canvasData(JSON.stringify({ nodes: [node], edges: [edge] })).edges.length,
    1,
  );
  for (const edges of [
    [edge, edge],
    [{ ...edge, toNode: "missing" }],
    [{ ...edge, fromSide: "middle" }],
    [{ ...edge, toEnd: "circle" }],
    [{ ...edge, color: 1 }],
  ]) {
    assert.throws(() => canvasData(JSON.stringify({ nodes: [node], edges })));
  }
});

test("canvas curves choose facing sides and route self loops around node bounds", () => {
  assert.deepEqual(edgePoint(node, "left"), { x: 0, y: 25 });
  assert.deepEqual(edgePoint(node, "bottom"), { x: 50, y: 50 });
  const right = { ...node, id: "two", x: 200 };
  const curve = edgeCurve(node, right, {
    id: "edge",
    fromNode: "one",
    toNode: "two",
  });
  assert.equal(curve.path, "M 100 25 C 200 25 100 25 200 25");
  assert.deepEqual(curve.label, { x: 150, y: 25 });
  const loop = edgeCurve(node, node, {
    id: "loop",
    fromNode: "one",
    toNode: "one",
    fromSide: "right",
    toSide: "right",
  });
  assert.ok(loop.bounds.width > node.width);
  assert.ok(loop.bounds.height > node.height);
  assert.match(loop.path, /^M 100 25 /);
  assert.match(loop.path, / L 100 25$/);
});
