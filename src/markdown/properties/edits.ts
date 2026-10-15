import { isMap, isNode, isScalar, parseDocument } from "yaml";
import { headerParts, frontmatter } from "./frontmatter";
import { orderPropertyBody } from "./order";
import { validPropertyName } from "./types";
import type { PropertyValue } from "./values";
import { propertyYamlInput, settablePropertyValue } from "./values";
import { mergeProperties } from "./merge";
import { setPropertyChanges } from "./alias-edits";
import {
  yamlValue,
  yamlKey,
  scalarValue,
  setPropertyChange,
  type PropertyChange,
} from "./yaml-value";

export type { PropertyChange };
export { yamlValue, yamlKey, scalarValue, setPropertyChange };

export type PropertyEdit =
  | { type: "order"; keys: readonly string[] }
  | { type: "merge"; values: Record<string, unknown> }
  | {
      type: "set";
      key: string;
      value: PropertyValue;
      /** When supplied, this text is the write source; value only validates it. */
      yaml?: string | undefined;
    }
  | { type: "add"; key: string; value?: PropertyValue }
  | { type: "rename"; key: string; name: string }
  | { type: "remove"; keys: readonly string[] };

type Header = NonNullable<ReturnType<typeof headerParts>>;

const propertyValue = (value: unknown): value is PropertyValue =>
  settablePropertyValue(value);

type KeyEdit = Exclude<PropertyEdit, { type: "order" | "merge" }>;

/** Structural edits touch selected keys/values, preserving unrelated YAML bytes. */
export function propertyChanges(
  source: string,
  edit: PropertyEdit,
): PropertyChange[] | undefined {
  if (edit.type === "order") {
    return reorderProperties(source, edit.keys);
  }
  if (edit.type === "merge") {
    return mergeProperties(source, edit.values);
  }
  if (!validKeyEdit(edit)) {
    return undefined;
  }
  const header = headerParts(source);
  if (!header) {
    return createHeader(source, edit);
  }
  const document = parseDocument(header.body, { uniqueKeys: true });
  if (
    document.errors.length ||
    (document.contents !== null && !isMap(document.contents))
  ) {
    return undefined;
  }
  const changes = new PropertyMapEdits(header, document).changes(source, edit);
  return changes && verifyChanges(source, edit, changes);
}

function reorderProperties(
  source: string,
  keys: readonly string[],
): PropertyChange[] | undefined {
  const header = headerParts(source);
  const ordered = header && orderPropertyBody(header.body, keys, header.eol);
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

function validKeyEdit(edit: KeyEdit): boolean {
  if (edit.type !== "remove" && !validPropertyName(edit.key)) {
    return false;
  }
  if (edit.type === "rename" && !validPropertyName(edit.name)) {
    return false;
  }
  if (edit.type === "set") {
    return (
      propertyValue(edit.value) &&
      (edit.yaml === undefined ||
        stableEqual(propertyYamlInput(edit.yaml), edit.value))
    );
  }
  return (
    edit.type !== "add" || edit.value === undefined || propertyValue(edit.value)
  );
}

function createHeader(
  source: string,
  edit: KeyEdit,
): PropertyChange[] | undefined {
  if (edit.type !== "add" || /^---(?:\r?\n|$)/.test(source)) {
    return undefined;
  }
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  return [
    {
      from: 0,
      to: 0,
      insert: `---${eol}${newPropertyLine(edit)}${eol}---${eol}${eol}`,
    },
  ];
}

class PropertyMapEdits {
  constructor(
    private readonly header: Header,
    private readonly document: ReturnType<typeof parseDocument>,
  ) {}

  private get items() {
    return isMap(this.document.contents) ? this.document.contents.items : [];
  }

  changes(source: string, edit: KeyEdit): PropertyChange[] | undefined {
    switch (edit.type) {
      case "add":
        return this.add(edit);
      case "rename":
        return this.rename(edit);
      case "remove":
        return this.remove(edit.keys);
      case "set": {
        const pair = this.items.find(
          (pair) => isScalar(pair.key) && pair.key.value === edit.key,
        );
        return setPropertyChanges({
          source,
          header: this.header,
          document: this.document,
          node: pair?.value,
          value: edit.value,
          yaml: edit.yaml,
        });
      }
    }
  }

  private wholeMap(): PropertyChange[] {
    const { header, document } = this;
    return [
      {
        from: header.offset,
        to: header.offset + header.body.length,
        insert: document.toString({ lineWidth: 0 }).replace(/\n/g, header.eol),
      },
    ];
  }

  private add(
    edit: Extract<KeyEdit, { type: "add" }>,
  ): PropertyChange[] | undefined {
    if (this.document.has(edit.key)) {
      return undefined;
    }
    if (isMap(this.document.contents) && this.document.contents.flow) {
      this.document.set(edit.key, edit.value ?? null);
      return this.wholeMap();
    }
    const end = this.header.offset + this.header.body.length;
    return [
      {
        from: end,
        to: end,
        insert: `${newPropertyLine(edit)}${this.header.eol}`,
      },
    ];
  }

  private rename(
    edit: Extract<KeyEdit, { type: "rename" }>,
  ): PropertyChange[] | undefined {
    const pair = this.items.find(
      (pair) => isScalar(pair.key) && pair.key.value === edit.key,
    );
    if (
      !pair ||
      !isScalar(pair.key) ||
      !pair.key.range ||
      (edit.key !== edit.name && this.document.has(edit.name))
    ) {
      return undefined;
    }
    return [
      {
        from: this.header.offset + pair.key.range[0],
        to: this.header.offset + pair.key.range[1],
        insert: yamlKey(edit.name),
      },
    ];
  }

  private remove(keys: readonly string[]): PropertyChange[] | undefined {
    if (
      keys.some((key) => !validPropertyName(key) || !this.document.has(key))
    ) {
      return undefined;
    }
    if (isMap(this.document.contents) && this.document.contents.flow) {
      keys.forEach((key) => this.document.delete(key));
      return this.wholeMap();
    }
    return this.items.flatMap((item) => {
      if (
        !isScalar(item.key) ||
        typeof item.key.value !== "string" ||
        !keys.includes(item.key.value) ||
        !item.key.range
      ) {
        return [];
      }
      const start =
        this.header.body.lastIndexOf("\n", item.key.range[0] - 1) + 1;
      let end =
        isNode(item.value) && item.value.range
          ? item.value.range[2]
          : item.key.range[2];
      if (this.header.body[end] === "\r") {
        end++;
      }
      if (this.header.body[end] === "\n") {
        end++;
      }
      return [
        {
          from: this.header.offset + start,
          to: this.header.offset + end,
          insert: "",
        },
      ];
    });
  }
}

function newPropertyLine(edit: Extract<KeyEdit, { type: "add" }>): string {
  return edit.value === undefined || edit.value === null
    ? `${yamlKey(edit.key)}:`
    : `${yamlKey(edit.key)}: ${yamlValue(edit.value)}`;
}

function stableEqual(
  left: unknown,
  right: unknown,
  seen = new WeakMap<object, object>(),
): boolean {
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
  if (seen.get(left) === right) {
    return true;
  }
  seen.set(left, right);
  const leftEntries = Array.isArray(left)
    ? left.map((value, index) => [String(index), value] as const)
    : Object.entries(left);
  const rightEntries = Array.isArray(right)
    ? right.map((value, index) => [String(index), value] as const)
    : Object.entries(right);
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }
  const rightMap = new Map(rightEntries);
  return leftEntries.every(
    ([key, value]) =>
      rightMap.has(key) && stableEqual(value, rightMap.get(key), seen),
  );
}

function applyChanges(source: string, changes: PropertyChange[]): string {
  let candidate = source;
  for (const change of [...changes].sort((a, b) => b.from - a.from)) {
    candidate =
      candidate.slice(0, change.from) +
      change.insert +
      candidate.slice(change.to);
  }
  return candidate;
}

function editTouchesKey(edit: KeyEdit, key: string): boolean {
  return (
    (edit.type === "set" && key === edit.key) ||
    (edit.type === "remove" && edit.keys.includes(key)) ||
    (edit.type === "rename" && key === edit.key)
  );
}

function verifyChanges(
  source: string,
  edit: KeyEdit,
  changes: PropertyChange[],
): PropertyChange[] | undefined {
  try {
    const before = frontmatter(source)?.values;
    const checked = frontmatter(applyChanges(source, changes));
    const after = checked?.values;
    if (!before || !after || checked?.error) {
      return undefined;
    }
    if (
      edit.type === "set" &&
      JSON.stringify(after[edit.key]) !== JSON.stringify(edit.value)
    ) {
      return undefined;
    }
    const stable = Object.entries(before).every(
      ([key, value]) =>
        editTouchesKey(edit, key) || stableEqual(after[key], value),
    );
    return stable ? changes : undefined;
  } catch {
    return undefined;
  }
}
