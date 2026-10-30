import {
  validPropertyName,
  type PropertyTypes,
} from "../../markdown/properties/types";

export function vaultPropertyNames(
  values: readonly (Record<string, unknown> | undefined)[],
  types: PropertyTypes,
): string[] {
  const names = new Set([
    "tags",
    "aliases",
    "cssclasses",
    "sources",
    ...Object.keys(types),
  ]);
  for (const properties of values) {
    for (const name of Object.keys(properties ?? {})) {
      if (validPropertyName(name)) {
        names.add(name);
      }
    }
  }
  return [...names]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 50_000);
}
