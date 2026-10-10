export const propertyKinds = [
  "text",
  "list",
  "number",
  "checkbox",
  "date",
  "datetime",
  "tags",
  "aliases",
] as const;
export type PropertyKind = (typeof propertyKinds)[number];
export type PropertyTypes = Readonly<Record<string, PropertyKind>>;
export const propertyKindLabels: Record<PropertyKind, string> = {
  text: "Text",
  list: "List",
  number: "Number",
  checkbox: "Checkbox",
  date: "Date",
  datetime: "Date & time",
  tags: "Tags",
  aliases: "Aliases",
};

export function propertyKind(value: unknown): value is PropertyKind {
  return (
    typeof value === "string" && propertyKinds.includes(value as PropertyKind)
  );
}

export function validPropertyName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 255 &&
    !/[\r\n\0]/.test(value)
  );
}

export function propertyTypes(value: unknown): value is PropertyTypes {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, kind]) =>
        validPropertyName(key) &&
        propertyKind(kind) &&
        (kind !== "tags" || key.toLowerCase() === "tags") &&
        (kind !== "aliases" || key.toLowerCase() === "aliases"),
    )
  );
}

export function inferPropertyKind(
  key: string,
  value: unknown,
  types: PropertyTypes = {},
): PropertyKind {
  const normalized = key.toLowerCase();
  const reserved = reservedPropertyKind(key);
  if (reserved) {
    return reserved;
  }
  if (Object.hasOwn(types, normalized)) {
    return types[normalized]!;
  }
  if (Array.isArray(value)) {
    return "list";
  }
  if (typeof value === "boolean") {
    return "checkbox";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "date";
  }
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)
  ) {
    return "datetime";
  }
  return "text";
}

export function reservedPropertyKind(key: string): PropertyKind | undefined {
  const reserved: Readonly<Record<string, PropertyKind>> = {
    tags: "tags",
    aliases: "aliases",
    cssclasses: "list",
  };
  const name = key.toLowerCase();
  return Object.hasOwn(reserved, name) ? reserved[name] : undefined;
}

export function canSetPropertyType(
  key: string,
  kind: PropertyKind | null,
): boolean {
  return (
    validPropertyName(key) &&
    !reservedPropertyKind(key) &&
    kind !== "tags" &&
    kind !== "aliases"
  );
}

/** YAML keys keep their spelling; the type registry separately folds case. */
export function propertyNameAvailable(
  name: string,
  keys: readonly string[],
  current?: string,
): boolean {
  return validPropertyName(name) && (name === current || !keys.includes(name));
}
