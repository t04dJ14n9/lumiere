import { isMap, isNode, isScalar, isSeq, parseDocument, stringify } from "yaml";
import { headerParts, frontmatter, editableList } from "./frontmatter";
import { orderPropertyBody } from "./order";
import { validPropertyName } from "./types";
import type { PropertyScalar, PropertyValue } from "./values";
import { mergeProperties } from "./merge";
export type PropertyEdit =
  | { type: "order"; keys: readonly string[] }
  | { type: "merge"; values: Record<string, unknown> }
  | { type: "set"; key: string; value: PropertyValue }
  | { type: "add"; key: string; value?: PropertyValue }
  | { type: "rename"; key: string; name: string }
  | { type: "remove"; keys: readonly string[] };
export interface PropertyChange {
  from: number;
  to: number;
  insert: string;
}

export const yamlValue = (value: unknown): string =>
  stringify(value, {
    collectionStyle: "flow",
    flowCollectionPadding: false,
    lineWidth: 0,
  }).trimEnd();
export const scalarValue = (value: unknown): value is PropertyScalar =>
  value === null ||
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value));
const propertyValue = (value: unknown): value is PropertyValue =>
  scalarValue(value) || (Array.isArray(value) && value.every(scalarValue));

export function setPropertyChange(
  source: string,
  header: NonNullable<ReturnType<typeof headerParts>>,
  node: unknown,
  value: unknown,
): PropertyChange | undefined {
  if (!isNode(node) || !node.range) {
    return undefined;
  }
  if (Array.isArray(value) && isSeq(node) && !editableList(node)) {
    return undefined;
  }
  let insert = yamlValue(value);
  if (isScalar(node) && typeof value === typeof node.value && typeof value === "string") {
    if (node.type === "QUOTE_SINGLE" && !/[\r\n]/.test(value)) {
      insert = "'" + value.replaceAll("'", "''") + "'";
    } else if (node.type === "QUOTE_DOUBLE" || /[\r\n]/.test(value)) {
      insert = JSON.stringify(value);
    }
  }
  const from = header.offset + node.range[0];
  const to = header.offset + node.range[1];
  if (source[from - 1] === ":") {
    insert = " " + insert;
  }
  if (source.slice(from, to).endsWith("\n")) {
    insert += header.eol;
  }
  return { from, to, insert };
}

/** Structural edits touch selected keys/values, preserving unrelated YAML bytes. */
export function propertyChanges(source: string, edit: PropertyEdit): PropertyChange[] | undefined {
  if (edit.type === "order") {
    const header = headerParts(source);
    const ordered = header && orderPropertyBody(header.body, edit.keys, header.eol);
    return header && ordered !== undefined
      ? [
          {
            from: header.offset,
            to: header.offset + header.body.length,
            insert: ordered,
          },
        ]
      : undefined;
  }
  if (edit.type === "merge") {
    return mergeProperties(source, edit.values);
  }
  if (edit.type !== "remove" && !validPropertyName(edit.key)) {
    return undefined;
  }
  if (edit.type === "rename" && !validPropertyName(edit.name)) {
    return undefined;
  }
  if (
    (edit.type === "set" && !propertyValue(edit.value)) ||
    (edit.type === "add" && edit.value !== undefined && !propertyValue(edit.value))
  ) {
    return undefined;
  }
  const header = headerParts(source);
  if (!header) {
    if (edit.type !== "add" || /^---(?:\r?\n|$)/.test(source)) {
      return undefined;
    }
    const eol = source.includes("\r\n") ? "\r\n" : "\n";
    return [
      {
        from: 0,
        to: 0,
        insert: `---${eol}${yamlValue(edit.key)}: ${yamlValue(edit.value ?? null)}${eol}---${eol}${eol}`,
      },
    ];
  }
  const document = parseDocument(header.body, { uniqueKeys: true });
  if (document.errors.length || (document.contents !== null && !isMap(document.contents))) {
    return undefined;
  }
  const items = isMap(document.contents) ? document.contents.items : [];
  const pair =
    edit.type === "remove"
      ? undefined
      : items.find((pair) => isScalar(pair.key) && pair.key.value === edit.key);
  const changes: PropertyChange[] = [];
  if (edit.type === "add") {
    if (document.has(edit.key)) {
      return undefined;
    }
    if (isMap(document.contents) && document.contents.flow) {
      document.set(edit.key, edit.value ?? null);
      changes.push({
        from: header.offset,
        to: header.offset + header.body.length,
        insert: document.toString({ lineWidth: 0 }).replace(/\n/g, header.eol),
      });
    } else {
      const end = header.offset + header.body.length;
      changes.push({
        from: end,
        to: end,
        insert: `${yamlValue(edit.key)}: ${yamlValue(edit.value ?? null)}${header.eol}`,
      });
    }
  } else if (edit.type === "rename") {
    if (
      !pair ||
      !isScalar(pair.key) ||
      !pair.key.range ||
      (edit.key !== edit.name && document.has(edit.name))
    ) {
      return undefined;
    }
    changes.push({
      from: header.offset + pair.key.range[0],
      to: header.offset + pair.key.range[1],
      insert: yamlValue(edit.name),
    });
  } else if (edit.type === "remove") {
    if (edit.keys.some((key) => !validPropertyName(key) || !document.has(key))) {
      return undefined;
    }
    if (isMap(document.contents) && document.contents.flow) {
      edit.keys.forEach((key) => document.delete(key));
      changes.push({
        from: header.offset,
        to: header.offset + header.body.length,
        insert: document.toString({ lineWidth: 0 }).replace(/\n/g, header.eol),
      });
    } else {
      for (const item of items) {
        if (
          !isScalar(item.key) ||
          typeof item.key.value !== "string" ||
          !edit.keys.includes(item.key.value) ||
          !item.key.range
        ) {
          continue;
        }
        const start = header.body.lastIndexOf("\n", item.key.range[0] - 1) + 1;
        let end = isNode(item.value) && item.value.range ? item.value.range[2] : item.key.range[2];
        if (header.body[end] === "\r") {
          end++;
        }
        if (header.body[end] === "\n") {
          end++;
        }
        changes.push({
          from: header.offset + start,
          to: header.offset + end,
          insert: "",
        });
      }
    }
  } else {
    const change = setPropertyChange(source, header, pair?.value, edit.value);
    if (!change) {
      return undefined;
    }
    changes.push(change);
  }
  try {
    let candidate = source;
    for (const change of [...changes].sort((a, b) => b.from - a.from)) {
      candidate = candidate.slice(0, change.from) + change.insert + candidate.slice(change.to);
    }
    const checked = frontmatter(candidate);
    if (!checked?.values || checked.error) {
      return undefined;
    }
    if (
      edit.type === "set" &&
      JSON.stringify(checked.values[edit.key]) !== JSON.stringify(edit.value)
    ) {
      return undefined;
    }
    return changes;
  } catch {
    return undefined;
  }
}
