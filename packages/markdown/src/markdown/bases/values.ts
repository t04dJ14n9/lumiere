import type { BaseCellValue, BaseNoteEntry } from "./types";

export type RuntimeVal =
  | { kind: "null" }
  | { kind: "boolean"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "date"; ms: number; dateOnly: boolean }
  | { kind: "duration"; ms: number }
  | { kind: "link"; target: string; label: string }
  | { kind: "tag"; value: string }
  | { kind: "list"; items: RuntimeVal[] }
  | { kind: "regexp"; regex: RegExp }
  | { kind: "file"; entry: BaseNoteEntry };

export const NULL_VAL: RuntimeVal = { kind: "null" };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?/;
const WIKI_LINK_RE = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/;

export function parseDurationMs(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  const match =
    /^(-?\d+(?:\.\d+)?)\s*(y|yr|year|years|mo|month|months|w|wk|week|weeks|d|day|days|h|hr|hour|hours|m|min|minute|minutes|s|sec|second|seconds)$/i.exec(
      trimmed,
    );
  if (!match) {
    return undefined;
  }
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  return amount * unitToMs(unit);
}

function unitToMs(unit: string): number {
  if (unit.startsWith("y")) {
    return 365 * 86_400_000;
  }
  if (unit === "mo" || unit.startsWith("month")) {
    return 30 * 86_400_000;
  }
  if (unit.startsWith("w")) {
    return 7 * 86_400_000;
  }
  if (unit.startsWith("d")) {
    return 86_400_000;
  }
  if (unit.startsWith("h")) {
    return 3_600_000;
  }
  if (unit.startsWith("m")) {
    return 60_000;
  }
  return 1000;
}

export function parseDateString(raw: string): RuntimeVal | undefined {
  const trimmed = raw.trim();
  if (!ISO_DATE_RE.test(trimmed)) {
    return undefined;
  }
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const ms = Date.parse(dateOnly ? `${trimmed}T00:00:00Z` : trimmed);
  if (Number.isNaN(ms)) {
    return undefined;
  }
  return { kind: "date", ms, dateOnly };
}

export function fromRawValue(raw: unknown): RuntimeVal {
  if (raw === null || raw === undefined) {
    return NULL_VAL;
  }
  if (typeof raw === "boolean") {
    return { kind: "boolean", value: raw };
  }
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { kind: "number", value: raw } : NULL_VAL;
  }
  if (raw instanceof Date) {
    return { kind: "date", ms: raw.getTime(), dateOnly: false };
  }
  if (typeof raw === "string") {
    return fromStringValue(raw);
  }
  if (Array.isArray(raw)) {
    return { kind: "list", items: raw.map((item) => fromRawValue(item)) };
  }
  return NULL_VAL;
}

function fromStringValue(raw: string): RuntimeVal {
  const wiki = WIKI_LINK_RE.exec(raw.trim());
  if (wiki) {
    const target = wiki[1]!.trim();
    const label = (wiki[2] ?? target).trim();
    return { kind: "link", target, label };
  }
  const dateVal = parseDateString(raw);
  if (dateVal) {
    return dateVal;
  }
  return { kind: "string", value: raw };
}

export function isTruthy(val: RuntimeVal): boolean {
  switch (val.kind) {
    case "null":
      return false;
    case "boolean":
      return val.value;
    case "number":
    case "duration":
      return val.kind === "number" ? val.value !== 0 : val.ms !== 0;
    case "string":
    case "tag":
      return val.value.length > 0;
    case "link":
      return val.target.length > 0;
    case "list":
      return val.items.length > 0;
    case "date":
    case "regexp":
    case "file":
      return true;
  }
}

export function isEmptyVal(val: RuntimeVal): boolean {
  if (val.kind === "null") {
    return true;
  }
  if (val.kind === "string" || val.kind === "tag") {
    return val.value.trim().length === 0;
  }
  if (val.kind === "list") {
    return val.items.length === 0;
  }
  return false;
}

export function formatDateVal(ms: number, dateOnly: boolean): string {
  const iso = new Date(ms).toISOString();
  if (dateOnly) {
    return iso.slice(0, 10);
  }
  return iso.slice(0, 16).replace("T", " ");
}

export function toStringVal(val: RuntimeVal): string {
  switch (val.kind) {
    case "null":
      return "";
    case "boolean":
      return val.value ? "true" : "false";
    case "number":
      return String(val.value);
    case "string":
    case "tag":
      return val.value;
    case "date":
      return formatDateVal(val.ms, val.dateOnly);
    case "duration":
      return `${Math.round((val.ms / 86_400_000) * 100) / 100}d`;
    case "link":
      return val.label || val.target;
    case "file":
      return val.entry.basename;
    case "list":
      return val.items.map((item) => toStringVal(item)).join(", ");
    case "regexp":
      return val.regex.toString();
  }
}

export function toNumberVal(val: RuntimeVal): number {
  switch (val.kind) {
    case "number":
      return val.value;
    case "boolean":
      return val.value ? 1 : 0;
    case "date":
    case "duration":
      return val.ms;
    case "string": {
      const parsed = Number(val.value);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    }
    default:
      return Number.NaN;
  }
}

export function compareRuntimeVals(a: RuntimeVal, b: RuntimeVal): number {
  if (a.kind === "null" && b.kind === "null") {
    return 0;
  }
  if (a.kind === "null") {
    return 1;
  }
  if (b.kind === "null") {
    return -1;
  }
  if (
    (a.kind === "number" || a.kind === "date" || a.kind === "duration") &&
    (b.kind === "number" || b.kind === "date" || b.kind === "duration")
  ) {
    return toNumberVal(a) - toNumberVal(b);
  }
  if (a.kind === "boolean" && b.kind === "boolean") {
    return Number(a.value) - Number(b.value);
  }
  return toStringVal(a).localeCompare(toStringVal(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function equalsRuntimeVals(a: RuntimeVal, b: RuntimeVal): boolean {
  if (a.kind === "null" || b.kind === "null") {
    return a.kind === b.kind;
  }
  if (a.kind === "number" && b.kind === "number") {
    return a.value === b.value;
  }
  if (a.kind === "boolean" && b.kind === "boolean") {
    return a.value === b.value;
  }
  if (a.kind === "date" && b.kind === "date") {
    return a.ms === b.ms;
  }
  return normalizeComparable(a) === normalizeComparable(b);
}

function normalizeComparable(val: RuntimeVal): string {
  if (val.kind === "link") {
    return stripMdExt(val.target).toLowerCase();
  }
  if (val.kind === "file") {
    return val.entry.basename.toLowerCase();
  }
  if (val.kind === "tag") {
    return val.value.replace(/^#/, "").toLowerCase();
  }
  return toStringVal(val).toLowerCase();
}

export function stripMdExt(value: string): string {
  return value.replace(/\.md$/i, "");
}

export function toCellValue(val: RuntimeVal): BaseCellValue {
  switch (val.kind) {
    case "null":
      return { kind: "null" };
    case "boolean":
      return { kind: "boolean", value: val.value };
    case "number":
      return { kind: "number", value: val.value };
    case "string":
      return { kind: "string", value: val.value };
    case "date":
      return {
        kind: "date",
        value: formatDateVal(val.ms, val.dateOnly),
        ms: val.ms,
        dateOnly: val.dateOnly,
      };
    case "duration":
      return { kind: "duration", ms: val.ms };
    case "link":
      return { kind: "link", target: val.target, label: val.label };
    case "tag":
      return { kind: "tag", value: val.value };
    case "file":
      return {
        kind: "link",
        target: val.entry.path,
        label: val.entry.basename,
      };
    case "list":
      return {
        kind: "list",
        items: val.items.map((item) => toCellValue(item)),
      };
    case "regexp":
      return { kind: "string", value: val.regex.toString() };
  }
}
