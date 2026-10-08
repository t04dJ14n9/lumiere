export const propertyKinds = [
  "text",
  "list",
  "number",
  "checkbox",
  "date",
  "datetime",
  "tags",
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
        (kind !== "tags" || key.toLowerCase() === "tags"),
    )
  );
}

export function inferPropertyKind(
  key: string,
  value: unknown,
  types: PropertyTypes = {},
): PropertyKind {
  const normalized = key.toLowerCase();
  if (normalized === "tags") {
    return "tags";
  }
  if (Object.hasOwn(types, normalized)) {
    return types[normalized]!;
  }
  if (
    Array.isArray(value) ||
    normalized === "aliases" ||
    normalized === "cssclasses"
  ) {
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
