import { planResourceOpen } from "./authorize";

export interface SourceRow {
  index: number;
  title?: string;
  resource: string;
  resourceLabel: string;
  navigable: boolean;
  id?: string;
  usageCount?: number;
  usageAbsent: boolean;
  usageWindow?: string;
  usageInherited: boolean;
  author?: string;
  lastModified?: string;
  raw?: string;
}

const KNOWN = new Set([
  "id",
  "title",
  "resource",
  "usage_count",
  "usage_window",
  "author",
  "last_modified",
]);

/** Display rows for a `sources` value. Every entry is kept; ids are never invented. */
export function sourceRows(
  value: unknown,
  inherited: Record<string, unknown>,
): SourceRow[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries.map((entry, index) => rowFrom(entry, index, inherited));
}

function rowFrom(
  entry: unknown,
  index: number,
  inherited: Record<string, unknown>,
): SourceRow {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return rawRow(index, entry);
  }
  const record = entry as Record<string, unknown>;
  if (typeof record.resource !== "string") {
    return rawRow(index, entry);
  }
  return structuredRow(record, index, inherited);
}

function rawRow(index: number, entry: unknown): SourceRow {
  const raw = stringify(entry);
  return {
    index,
    resource: "",
    resourceLabel: `Source ${index + 1}`,
    navigable: false,
    usageAbsent: true,
    usageInherited: false,
    raw,
  };
}

function structuredRow(
  record: Record<string, unknown>,
  index: number,
  inherited: Record<string, unknown>,
): SourceRow {
  const resource = record.resource as string;
  const title = text(record.title);
  const id = text(record.id);
  const author = text(record.author);
  const lastModified = text(record.last_modified);
  const extras = unknownFields(record);
  return {
    index,
    ...(title ? { title } : {}),
    resource,
    resourceLabel: title || resource,
    navigable: isNavigable(resource),
    ...(id ? { id } : {}),
    ...usageOf(record, inherited),
    ...(author ? { author } : {}),
    ...(lastModified ? { lastModified } : {}),
    ...(extras ? { raw: extras } : {}),
  };
}

function usageOf(
  record: Record<string, unknown>,
  inherited: Record<string, unknown>,
): Pick<
  SourceRow,
  "usageCount" | "usageAbsent" | "usageWindow" | "usageInherited"
> {
  const hasCount = typeof record.usage_count === "number";
  const ownWindow = text(record.usage_window);
  const inheritedWindow = text(inherited.usage_window);
  const usageWindow = ownWindow ?? inheritedWindow;
  return {
    ...(hasCount ? { usageCount: record.usage_count as number } : {}),
    usageAbsent: !hasCount,
    ...(usageWindow ? { usageWindow } : {}),
    usageInherited: !ownWindow && inheritedWindow !== undefined,
  };
}

function isNavigable(resource: string): boolean {
  const plan = planResourceOpen({
    resource,
    documentPath: "note.md",
    bundleRoot: "",
  });
  return plan.action === "external" || plan.action === "workspace";
}

function unknownFields(record: Record<string, unknown>): string | undefined {
  const extra = Object.fromEntries(
    Object.entries(record).filter(([key]) => !KNOWN.has(key)),
  );
  return Object.keys(extra).length > 0 ? stringify(extra) : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringify(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}
