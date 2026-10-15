import { isAlias, isNode, type Document } from "yaml";
import { propertyYamlInput, settablePropertyNode } from "./values";
import { valueStart } from "./yaml-value";

/** Remove only the property's outer indentation, keeping nested YAML verbatim. */
export function propertyYamlDraft(
  body: string,
  node: unknown,
  value: unknown,
  document?: Document,
): string | undefined {
  const isReference = isAlias(node);
  const valueNode = isReference && document ? node.resolve(document) : node;
  if (
    !isNode(valueNode) ||
    !valueNode.range ||
    !settablePropertyNode(valueNode, document)
  ) {
    return undefined;
  }
  // A top-level alias edits a copy of its target, without copying its anchor.
  const start = isReference
    ? valueNode.range[0]
    : valueStart(body, valueNode.range[0], valueNode.anchor);
  const lineStart = body.lastIndexOf("\n", valueNode.range[0] - 1) + 1;
  const indent = /^ */.exec(body.slice(lineStart))![0];
  const text = body
    .slice(start, valueNode.range[1])
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line, index) =>
      index > 0 && line.startsWith(indent) ? line.slice(indent.length) : line,
    )
    .join("\n");
  const parsed = propertyYamlInput(text);
  return parsed !== undefined && yamlDraftEqual(parsed, value)
    ? text
    : undefined;
}

/** Preserve the guard against aliases or tagged values that cannot round-trip. */
function yamlDraftEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (
    !left ||
    !right ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) !== Array.isArray(right)
  ) {
    return false;
  }
  const keys = Object.keys(left);
  const rightKeys = Object.keys(right);
  const leftValues = Object.values(left);
  const rightValues = Object.values(right);
  return (
    keys.length === rightKeys.length &&
    keys.every(
      (key, index) =>
        key === rightKeys[index] &&
        yamlDraftEqual(leftValues[index], rightValues[index]),
    )
  );
}
