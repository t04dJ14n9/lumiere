import { isMap, isNode, isScalar, parseDocument, stringify } from "yaml";
import { headerParts, frontmatter } from "./frontmatter";
import { orderPropertyBody } from "./order";
import { validPropertyName } from "./types";
import type { PropertyScalar, PropertyValue } from "./values";
import { settablePropertyValue } from "./values";
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
  settablePropertyValue(value);

export function setPropertyChange(
  source: string,
  header: NonNullable<ReturnType<typeof headerParts>>,
  node: unknown,
  value: unknown,
): PropertyChange | undefined {
  if (!isNode(node) || !node.range) {
    return undefined;
  }
  // Complex sequences (list-of-maps) are replaced wholesale as YAML text.
  let insert = yamlValue(value);
  if (
    isScalar(node) &&
    typeof value === typeof node.value &&
    typeof value === "string"
  ) {
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

type KeyEdit = Exclude<PropertyEdit, { type: "order" | "merge" }>;
type Header = NonNullable<ReturnType<typeof headerParts>>;

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
    return propertyValue(edit.value);
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
        const change = setPropertyChange(
          source,
          this.header,
          pair?.value,
          edit.value,
        );
        return change ? [change] : undefined;
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
        insert: yamlValue(edit.name),
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
    ? `${yamlValue(edit.key)}:`
    : `${yamlValue(edit.key)}: ${yamlValue(edit.value)}`;
}

function verifyChanges(
  source: string,
  edit: KeyEdit,
  changes: PropertyChange[],
): PropertyChange[] | undefined {
  try {
    let candidate = source;
    for (const change of [...changes].sort((a, b) => b.from - a.from)) {
      candidate =
        candidate.slice(0, change.from) +
        change.insert +
        candidate.slice(change.to);
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
