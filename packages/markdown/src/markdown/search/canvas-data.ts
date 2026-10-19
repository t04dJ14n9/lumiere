import { record } from "../../shared/guards";
import type { CanvasNode, CanvasEdge, CanvasData } from "./canvas";
const sides = ["top", "right", "bottom", "left"];
export function canvasData(source: string): CanvasData {
  const data: unknown = JSON.parse(source);
  if (
    !record(data) ||
    (data.nodes !== undefined && !Array.isArray(data.nodes)) ||
    (data.edges !== undefined && !Array.isArray(data.edges))
  ) {
    throw new Error("Canvas must contain node and edge arrays.");
  }
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  const ids = new Set<string>();
  for (const value of data.nodes ?? []) {
    const node = validatedNode(value, ids);
    ids.add(node.id);
    nodes.push(node);
  }
  const edgeIds = new Set<string>();
  for (const value of data.edges ?? []) {
    const edge = validatedEdge(value, { nodes: ids, edges: edgeIds });
    edgeIds.add(edge.id);
    edges.push(edge);
  }
  return { nodes, edges };
}

function validatedNode(node: unknown, ids: Set<string>): CanvasNode {
  if (
    !record(node) ||
    typeof node.id !== "string" ||
    ids.has(node.id) ||
    !["text", "file", "link", "group"].includes(String(node.type)) ||
    !["x", "y", "width", "height"].every(
      (key) => typeof node[key] === "number" && Number.isSafeInteger(node[key]),
    ) ||
    Number(node.width) <= 0 ||
    Number(node.height) <= 0
  ) {
    throw new Error("Canvas contains an invalid or duplicate node.");
  }
  validateNodeFields(node);
  return node as unknown as CanvasNode;
}

function validatedEdge(
  edge: unknown,
  ids: { nodes: Set<string>; edges: Set<string> },
): CanvasEdge {
  if (
    !record(edge) ||
    typeof edge.id !== "string" ||
    ids.edges.has(edge.id) ||
    typeof edge.fromNode !== "string" ||
    !ids.nodes.has(edge.fromNode) ||
    typeof edge.toNode !== "string" ||
    !ids.nodes.has(edge.toNode)
  ) {
    throw new Error("Canvas contains an invalid edge.");
  }
  validateEdgeFields(edge);
  return edge as unknown as CanvasEdge;
}

function validateNodeFields(node: Record<string, unknown>): void {
  for (const field of [
    "color",
    "text",
    "file",
    "subpath",
    "url",
    "label",
    "background",
    "backgroundStyle",
  ]) {
    if (node[field] !== undefined && typeof node[field] !== "string") {
      throw new Error(`Invalid Canvas node ${field}.`);
    }
  }
  const required = requiredField(String(node.type));
  if (required && typeof node[required] !== "string") {
    throw new Error(`Canvas node requires ${required}.`);
  }
  if (
    node.subpath !== undefined &&
    (typeof node.subpath !== "string" || !node.subpath.startsWith("#"))
  ) {
    throw new Error("Canvas subpaths must begin with #.");
  }
  if (
    node.backgroundStyle !== undefined &&
    (typeof node.backgroundStyle !== "string" ||
      !["cover", "ratio", "repeat"].includes(node.backgroundStyle))
  ) {
    throw new Error("Invalid Canvas background style.");
  }
}
function requiredField(type: string): string | undefined {
  switch (type) {
    case "text":
      return "text";
    case "file":
      return "file";
    case "link":
      return "url";
    default:
      return undefined;
  }
}

function validateEdgeFields(edge: Record<string, unknown>): void {
  for (const key of ["fromSide", "toSide"]) {
    if (
      edge[key] !== undefined &&
      (typeof edge[key] !== "string" || !sides.includes(edge[key]))
    ) {
      throw new Error("Invalid Canvas edge side.");
    }
  }
  for (const key of ["fromEnd", "toEnd"]) {
    if (
      edge[key] !== undefined &&
      (typeof edge[key] !== "string" || !["none", "arrow"].includes(edge[key]))
    ) {
      throw new Error("Invalid Canvas edge end.");
    }
  }
  for (const key of ["label", "color"]) {
    if (edge[key] !== undefined && typeof edge[key] !== "string") {
      throw new Error(`Invalid Canvas edge ${key}.`);
    }
  }
}
