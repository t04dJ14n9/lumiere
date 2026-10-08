import test from "node:test";
import assert from "node:assert/strict";
import {
  canvasData,
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
