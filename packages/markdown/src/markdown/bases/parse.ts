import { loadYaml } from "../properties/load-yaml";
import type {
  BaseDefinition,
  BaseFilter,
  BasePropertyConfig,
  BaseSortRule,
  BaseViewConfig,
  BaseViewType,
} from "./types";

const VIEW_TYPES: ReadonlySet<string> = new Set([
  "table",
  "cards",
  "list",
  "map",
]);

/** Normalize a property identifier to `file.*`, `formula.*`, or `note.*`. */
export function normalizePropertyId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "file.name";
  }
  if (trimmed === "file") {
    return "file.file";
  }
  if (trimmed.startsWith("file.")) {
    const field = trimmed.slice(5).toLowerCase();
    if (field === "extension") {
      return "file.ext";
    }
    if (field === "outlinks") {
      return "file.links";
    }
    return `file.${field}`;
  }
  if (trimmed.startsWith("note.") || trimmed.startsWith("formula.")) {
    return trimmed;
  }
  return `note.${trimmed}`;
}

export function stripPropertyPrefix(propId: string): string {
  const dot = propId.indexOf(".");
  return dot >= 0 ? propId.slice(dot + 1) : propId;
}

export function resolveDisplayName(
  propId: string,
  properties: Record<string, BasePropertyConfig>,
): string {
  const normalized = normalizePropertyId(propId);
  const bare = stripPropertyPrefix(normalized);
  const configured =
    properties[normalized]?.displayName ?? properties[bare]?.displayName;
  if (configured !== undefined) {
    return configured;
  }
  if (normalized === "file.file" || normalized === "file.name") {
    return "name";
  }
  return bare;
}

export function parseFilter(raw: unknown): BaseFilter | undefined {
  if (typeof raw === "string") {
    const expr = raw.trim();
    return expr ? { kind: "expr", expr } : undefined;
  }
  if (Array.isArray(raw)) {
    const items = raw
      .map((item) => parseFilter(item))
      .filter((item): item is BaseFilter => item !== undefined);
    return items.length > 0 ? { kind: "and", items } : undefined;
  }
  if (raw && typeof raw === "object") {
    return parseFilterObject(raw as Record<string, unknown>);
  }
  return undefined;
}

function parseFilterObject(
  record: Record<string, unknown>,
): BaseFilter | undefined {
  if ("and" in record) {
    return parseFilterGroup("and", record.and);
  }
  if ("or" in record) {
    return parseFilterGroup("or", record.or);
  }
  if ("not" in record) {
    return parseFilterGroup("not", record.not);
  }
  const items: BaseFilter[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      items.push({
        kind: "expr",
        expr: `${normalizePropertyId(key)} == ${JSON.stringify(value)}`,
      });
    }
  }
  return items.length > 0 ? { kind: "and", items } : undefined;
}

function parseFilterGroup(
  kind: "and" | "or" | "not",
  raw: unknown,
): BaseFilter | undefined {
  const list = Array.isArray(raw) ? raw : [raw];
  const items = list
    .map((item) => parseFilter(item))
    .filter((item): item is BaseFilter => item !== undefined);
  return items.length > 0 ? { kind, items } : undefined;
}

function parseStringMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      result[key] = String(value);
    }
  }
  return result;
}

function parseProperties(raw: unknown): Record<string, BasePropertyConfig> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const result: Record<string, BasePropertyConfig> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalized = normalizePropertyId(key);
    let displayName: string | undefined;
    if (typeof value === "string") {
      displayName = value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      const candidate = (value as Record<string, unknown>).displayName;
      if (typeof candidate === "string") {
        displayName = candidate;
      }
    }
    const config: BasePropertyConfig =
      displayName === undefined ? {} : { displayName };
    result[normalized] = config;
    result[key] = config;
  }
  return result;
}

function parseSortRule(raw: unknown): BaseSortRule | undefined {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }
    if (trimmed.startsWith("-")) {
      return {
        property: normalizePropertyId(trimmed.slice(1)),
        direction: "DESC",
      };
    }
    const [prop, dir] = trimmed.split(":");
    const direction = dir?.trim().toUpperCase() === "DESC" ? "DESC" : "ASC";
    return { property: normalizePropertyId(prop!), direction };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  const prop = obj.property ?? obj.column;
  if (typeof prop !== "string" || !prop.trim()) {
    return undefined;
  }
  const dir =
    typeof obj.direction === "string" && obj.direction.toUpperCase() === "DESC"
      ? "DESC"
      : "ASC";
  return { property: normalizePropertyId(prop), direction: dir };
}

function parseOrder(
  raw: unknown,
  fallbackProperties: Record<string, BasePropertyConfig>,
): string[] {
  if (Array.isArray(raw)) {
    const order = raw
      .filter((item): item is string => typeof item === "string")
      .map((item) => normalizePropertyId(item));
    if (order.length > 0) {
      return order;
    }
  }
  const propKeys = [
    ...new Set(
      Object.keys(fallbackProperties).map((key) => normalizePropertyId(key)),
    ),
  ];
  if (propKeys.length === 0) {
    return ["file.name"];
  }
  return propKeys.includes("file.name") ? propKeys : ["file.name", ...propKeys];
}

function parseViewType(raw: unknown): BaseViewType {
  const str = typeof raw === "string" ? raw.toLowerCase() : "";
  return VIEW_TYPES.has(str) ? (str as BaseViewType) : "table";
}

function parseViewName(raw: unknown, index: number): string {
  return typeof raw === "string" && raw.trim()
    ? raw.trim()
    : `View ${index + 1}`;
}

function parseViewLimit(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0
    ? Math.floor(raw)
    : undefined;
}

function parseViewSummaries(raw: unknown): Record<string, string> {
  const summaries: Record<string, string> = {};
  for (const [k, v] of Object.entries(parseStringMap(raw))) {
    summaries[normalizePropertyId(k)] = v;
  }
  return summaries;
}

function parseViewSortList(raw: unknown): BaseSortRule[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => parseSortRule(item))
    .filter((item): item is BaseSortRule => item !== undefined);
}

function asViewRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function parseView(
  raw: unknown,
  index: number,
  properties: Record<string, BasePropertyConfig>,
): BaseViewConfig {
  const obj = asViewRecord(raw);
  const filters = parseFilter(obj.filters);
  const groupBy = parseSortRule(obj.groupBy);
  const limit = parseViewLimit(obj.limit);
  return {
    type: parseViewType(obj.type),
    name: parseViewName(obj.name, index),
    order: parseOrder(obj.order ?? obj.properties ?? obj.columns, properties),
    sort: parseViewSortList(obj.sort),
    summaries: parseViewSummaries(obj.summaries),
    ...(filters ? { filters } : {}),
    ...(groupBy ? { groupBy } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

export function parseBaseYaml(source: string): BaseDefinition {
  const document = loadYaml().parseDocument(source, { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(document.errors[0]!.message);
  }
  const raw: unknown = document.toJS({ maxAliasCount: 100 }) ?? {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Base file must be a YAML mapping.");
  }
  const record = raw as Record<string, unknown>;
  const filters = parseFilter(record.filters);
  const formulas = parseStringMap(record.formulas);
  const properties = {
    ...parseProperties(record.display),
    ...parseProperties(record.properties),
  };
  const summaries = parseStringMap(record.summaries);
  const rawViews = Array.isArray(record.views) ? record.views : [];
  const views =
    rawViews.length > 0
      ? rawViews.map((v, idx) => parseView(v, idx, properties))
      : [
          {
            type: "table" as const,
            name: "Table",
            order: parseOrder(undefined, properties),
            sort: [],
            summaries: {},
          },
        ];
  return {
    ...(filters ? { filters } : {}),
    formulas,
    properties,
    summaries,
    views,
  };
}
