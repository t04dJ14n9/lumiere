import { isAlias, isNode, stringify, type Document } from "yaml";
import {
  propertyYamlInput,
  settablePropertyNode,
  settablePropertyValue,
} from "./values";
import { valueStart } from "./yaml-value";

/** Prefer verbatim YAML; keep settable values editable if the slice cannot stand alone. */
export function propertyYamlDraft(
  body: string,
  node: unknown,
  value: unknown,
  document?: Document,
): string | undefined {
  if (!settablePropertyNode(node, document) || !settablePropertyValue(value)) {
    return undefined;
  }
  // References outside this property are absent from its slice. Serialize a
  // standalone copy only when the original text cannot be used as a draft.
  return (
    rawPropertyYamlDraft(body, node, value, document) ??
    stringify(value, { aliasDuplicateObjects: false, lineWidth: 0 })
  );
}

/** Remove only the property's outer indentation, keeping nested YAML verbatim. */
function rawPropertyYamlDraft(
  body: string,
  node: unknown,
  value: unknown,
  document?: Document,
): string | undefined {
  const isReference = isAlias(node);
  const valueNode = isReference && document ? node.resolve(document) : node;
  if (!isNode(valueNode) || !valueNode.range) {
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

/** Reuse source text only when it parses independently to the same value. */
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
