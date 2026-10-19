import { validPropertyName } from "../../markdown/properties/types";
import type { PropertyKind } from "../../markdown/properties/types";
import type { PropertyTypes, WirePropertyType } from "./api";
import { isRecord } from "./app-settings";

const WIRE_TYPES: readonly WirePropertyType[] = [
  "text",
  "number",
  "checkbox",
  "date",
  "datetime",
  "multitext",
  "tags",
  "aliases",
];
const BUILTINS: Readonly<Record<string, WirePropertyType>> = Object.freeze({
  tags: "tags",
  aliases: "aliases",
  cssclasses: "multitext",
});

export interface TypesDocument {
  readonly source: string | undefined;
  readonly document: Record<string, unknown>;
  readonly entries: Record<string, unknown>;
  readonly types: PropertyTypes;
}

export function parseTypesDocument(source: string | undefined): TypesDocument {
  const document: unknown = source === undefined ? {} : JSON.parse(source);
  if (
    !isRecord(document) ||
    (document.types !== undefined && !isRecord(document.types))
  ) {
    throw new Error("Obsidian types.json must contain a types object.");
  }
  const entries = isRecord(document.types) ? document.types : {};
  const types = Object.freeze(
    Object.fromEntries(
      Object.entries(entries).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  );
  return { source, document, entries, types };
}

export function validatePropertyType(
  name: string,
  type: WirePropertyType | null,
): void {
  if (
    !validPropertyName(name) ||
    (type !== null && !WIRE_TYPES.includes(type))
  ) {
    throw new Error("Invalid Obsidian property type.");
  }
  const builtin = Object.hasOwn(BUILTINS, name.toLowerCase())
    ? BUILTINS[name.toLowerCase()]
    : undefined;
  if (builtin && type !== null && type !== builtin) {
    throw new Error(`The built-in ${name} property must use ${builtin}.`);
  }
}

export function editTypesDocument(
  snapshot: TypesDocument,
  name: string,
  type: WirePropertyType | null,
): string {
  validatePropertyType(name, type);
  const types = { ...snapshot.entries };
  if (type === null) {
    delete types[name];
  } else {
    Object.defineProperty(types, name, {
      value: type,
      enumerable: true,
      configurable: true,
    });
  }
  return JSON.stringify({ ...snapshot.document, types }, null, 2) + "\n";
}

export function editablePropertyKind(type: string): PropertyKind | undefined {
  if (type === "multitext") {
    return "list";
  }
  return WIRE_TYPES.includes(type as WirePropertyType)
    ? (type as PropertyKind)
    : undefined;
}

export function wirePropertyType(kind: PropertyKind): WirePropertyType {
  return kind === "list" ? "multitext" : kind;
}
