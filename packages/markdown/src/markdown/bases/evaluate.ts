import { normalizePropertyId, resolveDisplayName } from "./parse";
import {
  createEvalContext,
  evalFilter,
  evalPropertyById,
  type EvalContext,
} from "./runtime";
import type {
  BaseColumn,
  BaseDefinition,
  BaseEvaluatedGroup,
  BaseEvaluatedRow,
  BaseEvaluatedView,
  BaseFilter,
  BaseNoteEntry,
  BaseSortRule,
  BaseViewConfig,
} from "./types";
import {
  compareRuntimeVals,
  isEmptyVal,
  toCellValue,
  toNumberVal,
  toStringVal,
  type RuntimeVal,
} from "./values";

export interface EvaluateBaseOptions {
  thisEntry?: BaseNoteEntry;
  nowMs?: number;
}

export function selectBaseView(
  definition: BaseDefinition,
  viewName?: string,
): BaseViewConfig | undefined {
  const trimmed = viewName?.trim() ?? "";
  if (!trimmed) {
    return definition.views[0];
  }
  const exact = definition.views.find((v) => v.name === trimmed);
  if (exact) {
    return exact;
  }
  const lower = trimmed.toLowerCase();
  return definition.views.find((v) => v.name.toLowerCase() === lower);
}

function combineFilters(
  first?: BaseFilter,
  second?: BaseFilter,
): BaseFilter | undefined {
  if (first && second) {
    return { kind: "and", items: [first, second] };
  }
  return first ?? second;
}

interface InternalRow {
  entry: BaseNoteEntry;
  ctx: EvalContext;
  rawCells: Map<string, RuntimeVal>;
  row: BaseEvaluatedRow;
}

function getRawCell(row: InternalRow, propId: string): RuntimeVal {
  const normalized = normalizePropertyId(propId);
  const existing = row.rawCells.get(normalized);
  if (existing) {
    return existing;
  }
  const val = evalPropertyById(normalized, row.ctx);
  row.rawCells.set(normalized, val);
  row.row.cells[normalized] = toCellValue(val);
  return val;
}

function sortInternalRows(rows: InternalRow[], rules: BaseSortRule[]): void {
  const effectiveRules: BaseSortRule[] =
    rules.length > 0 ? rules : [{ property: "file.name", direction: "ASC" }];
  rows.sort((a, b) => {
    for (const rule of effectiveRules) {
      const cmp = compareRuntimeVals(
        getRawCell(a, rule.property),
        getRawCell(b, rule.property),
      );
      if (cmp !== 0) {
        return rule.direction === "DESC" ? -cmp : cmp;
      }
    }
    return a.entry.basename.localeCompare(b.entry.basename, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function buildGroups(
  rows: InternalRow[],
  groupBy?: BaseSortRule,
): BaseEvaluatedGroup[] {
  if (!groupBy) {
    return [{ rows: rows.map((r) => r.row) }];
  }
  const bucketMap = new Map<
    string,
    { rawKey: RuntimeVal; group: BaseEvaluatedGroup }
  >();
  for (const item of rows) {
    const rawKey = getRawCell(item, groupBy.property);
    const keyId = `${rawKey.kind}:${toStringVal(rawKey).toLowerCase()}`;
    let bucket = bucketMap.get(keyId);
    if (!bucket) {
      bucket = {
        rawKey,
        group: { key: toCellValue(rawKey), rows: [] },
      };
      bucketMap.set(keyId, bucket);
    }
    bucket.group.rows.push(item.row);
  }
  const buckets = [...bucketMap.values()];
  buckets.sort((a, b) => {
    const cmp = compareRuntimeVals(a.rawKey, b.rawKey);
    return groupBy.direction === "DESC" ? -cmp : cmp;
  });
  return buckets.map((b) => b.group);
}

function computeSummaryValue(name: string, values: RuntimeVal[]): string {
  const lower = name.trim().toLowerCase();
  if (lower === "empty") {
    return String(values.filter((v) => isEmptyVal(v)).length);
  }
  if (lower === "filled") {
    return String(values.filter((v) => !isEmptyVal(v)).length);
  }
  if (lower === "checked") {
    return String(values.filter((v) => v.kind === "boolean" && v.value).length);
  }
  if (lower === "unchecked") {
    return String(
      values.filter((v) => v.kind !== "boolean" || !v.value).length,
    );
  }
  if (lower === "unique") {
    const set = new Set(
      values
        .filter((v) => !isEmptyVal(v))
        .map((v) => toStringVal(v).toLowerCase()),
    );
    return String(set.size);
  }
  return computeNumericSummary(lower, values);
}

function computeNumericSummary(lower: string, values: RuntimeVal[]): string {
  const nums = values
    .map((v) => toNumberVal(v))
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) {
    return lower === "sum" ? "0" : "";
  }
  if (lower === "sum") {
    return formatNumber(nums.reduce((a, b) => a + b, 0));
  }
  if (lower === "average" || lower === "mean") {
    return formatNumber(nums.reduce((a, b) => a + b, 0) / nums.length);
  }
  if (lower === "min" || lower === "earliest") {
    return formatNumber(Math.min(...nums));
  }
  if (lower === "max" || lower === "latest") {
    return formatNumber(Math.max(...nums));
  }
  if (lower === "median") {
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const val =
      sorted.length % 2 === 0
        ? (sorted[mid - 1]! + sorted[mid]!) / 2
        : sorted[mid]!;
    return formatNumber(val);
  }
  return "";
}

function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function evaluateBaseView(
  definition: BaseDefinition,
  view: BaseViewConfig,
  entries: BaseNoteEntry[],
  options: EvaluateBaseOptions = {},
): BaseEvaluatedView {
  const nowMs = options.nowMs ?? Date.now();
  const filter = combineFilters(definition.filters, view.filters);
  const columns: BaseColumn[] = view.order.map((rawId) => {
    const id = normalizePropertyId(rawId);
    return {
      id,
      displayName: resolveDisplayName(id, definition.properties),
    };
  });
  const matched: InternalRow[] = [];
  for (const entry of entries) {
    const ctx = createEvalContext(
      entry,
      definition.formulas,
      options.thisEntry,
      nowMs,
    );
    if (filter && !evalFilter(filter, ctx)) {
      continue;
    }
    const item: InternalRow = {
      entry,
      ctx,
      rawCells: new Map(),
      row: { entry, cells: {} },
    };
    for (const col of columns) {
      getRawCell(item, col.id);
    }
    matched.push(item);
  }
  const totalMatches = matched.length;
  sortInternalRows(matched, view.sort);
  const limited =
    view.limit !== undefined ? matched.slice(0, view.limit) : matched;
  const groups = buildGroups(limited, view.groupBy);
  const summaries: Record<string, string> = {};
  for (const [propId, summaryType] of Object.entries(view.summaries)) {
    const colId = normalizePropertyId(propId);
    const values = limited.map((item) => getRawCell(item, colId));
    summaries[colId] = computeSummaryValue(summaryType, values);
  }
  return {
    view,
    columns,
    rows: limited.map((r) => r.row),
    groups,
    summaries,
    totalMatches,
  };
}
