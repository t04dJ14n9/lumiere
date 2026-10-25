import {
  NULL_VAL,
  compareRuntimeVals,
  equalsRuntimeVals,
  parseDateString,
  parseDurationMs,
  toNumberVal,
  toStringVal,
  type RuntimeVal,
} from "./values";

export function evalStringMethod(
  str: string,
  method: string,
  args: RuntimeVal[],
): RuntimeVal {
  const arg0 = args[0] ? toStringVal(args[0]) : "";
  switch (method) {
    case "contains":
      return {
        kind: "boolean",
        value: str.toLowerCase().includes(arg0.toLowerCase()),
      };
    case "containsAll":
      return {
        kind: "boolean",
        value: args.every((a) =>
          str.toLowerCase().includes(toStringVal(a).toLowerCase()),
        ),
      };
    case "containsAny":
      return {
        kind: "boolean",
        value: args.some((a) =>
          str.toLowerCase().includes(toStringVal(a).toLowerCase()),
        ),
      };
    case "startsWith":
      return { kind: "boolean", value: str.startsWith(arg0) };
    case "endsWith":
      return { kind: "boolean", value: str.endsWith(arg0) };
    case "lower":
      return { kind: "string", value: str.toLowerCase() };
    case "upper":
      return { kind: "string", value: str.toUpperCase() };
    case "trim":
      return { kind: "string", value: str.trim() };
    case "title":
      return {
        kind: "string",
        value: str.replace(/\b\w/g, (c) => c.toUpperCase()),
      };
    default:
      return evalStringTransformMethod(str, method, args);
  }
}

function evalStringTransformMethod(
  str: string,
  method: string,
  args: RuntimeVal[],
): RuntimeVal {
  if (method === "replace") {
    const search = args[0] ? toStringVal(args[0]) : "";
    const rep = args[1] ? toStringVal(args[1]) : "";
    return { kind: "string", value: str.split(search).join(rep) };
  }
  if (method === "split") {
    const sep = args[0] ? toStringVal(args[0]) : ",";
    return {
      kind: "list",
      items: str.split(sep).map((s) => ({ kind: "string", value: s })),
    };
  }
  if (method === "slice") {
    const start = args[0] ? toNumberVal(args[0]) : 0;
    const end = args[1] ? toNumberVal(args[1]) : undefined;
    return { kind: "string", value: str.slice(start, end) };
  }
  if (method === "matches") {
    const first = args[0];
    if (first?.kind === "regexp") {
      return { kind: "boolean", value: first.regex.test(str) };
    }
    const pattern = first ? toStringVal(first) : "";
    return { kind: "boolean", value: new RegExp(pattern).test(str) };
  }
  return NULL_VAL;
}

export function evalNumberMethod(
  num: number,
  method: string,
  args: RuntimeVal[],
): RuntimeVal {
  switch (method) {
    case "round": {
      const digits = args[0] ? toNumberVal(args[0]) : 0;
      const factor = 10 ** (Number.isFinite(digits) ? digits : 0);
      return { kind: "number", value: Math.round(num * factor) / factor };
    }
    case "floor":
      return { kind: "number", value: Math.floor(num) };
    case "ceil":
      return { kind: "number", value: Math.ceil(num) };
    case "abs":
      return { kind: "number", value: Math.abs(num) };
    case "toFixed": {
      const digits = args[0] ? toNumberVal(args[0]) : 0;
      return {
        kind: "string",
        value: num.toFixed(Number.isFinite(digits) ? digits : 0),
      };
    }
    default:
      return NULL_VAL;
  }
}

export function evalListMethod(
  items: RuntimeVal[],
  method: string,
  args: RuntimeVal[],
): RuntimeVal {
  switch (method) {
    case "contains":
      return {
        kind: "boolean",
        value: args[0] ? listContains(items, args[0]) : false,
      };
    case "containsAny":
      return {
        kind: "boolean",
        value: args.some((arg) => listContains(items, arg)),
      };
    case "containsAll":
      return {
        kind: "boolean",
        value: args.every((arg) => listContains(items, arg)),
      };
    case "join": {
      const sep = args[0] ? toStringVal(args[0]) : ", ";
      return {
        kind: "string",
        value: items.map((item) => toStringVal(item)).join(sep),
      };
    }
    case "sort":
      return {
        kind: "list",
        items: [...items].sort((a, b) => compareRuntimeVals(a, b)),
      };
    case "reverse":
      return { kind: "list", items: [...items].reverse() };
    default:
      return evalListMathMethod(items, method, args);
  }
}

function evalListMathMethod(
  items: RuntimeVal[],
  method: string,
  args: RuntimeVal[],
): RuntimeVal {
  if (method === "slice") {
    const start = args[0] ? toNumberVal(args[0]) : 0;
    const end = args[1] ? toNumberVal(args[1]) : undefined;
    return { kind: "list", items: items.slice(start, end) };
  }
  if (method === "unique" || method === "flat") {
    const seen = new Set<string>();
    const unique: RuntimeVal[] = [];
    for (const item of items) {
      const key = `${item.kind}:${toStringVal(item).toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }
    return { kind: "list", items: unique };
  }
  const nums = items
    .map((item) => toNumberVal(item))
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) {
    return method === "sum" ? { kind: "number", value: 0 } : NULL_VAL;
  }
  if (method === "sum") {
    return { kind: "number", value: nums.reduce((a, b) => a + b, 0) };
  }
  if (method === "mean" || method === "average") {
    return {
      kind: "number",
      value: nums.reduce((a, b) => a + b, 0) / nums.length,
    };
  }
  if (method === "min") {
    return { kind: "number", value: Math.min(...nums) };
  }
  if (method === "max") {
    return { kind: "number", value: Math.max(...nums) };
  }
  return NULL_VAL;
}

function listContains(items: RuntimeVal[], needle: RuntimeVal): boolean {
  const needleStr = toStringVal(needle).replace(/^#/, "").toLowerCase();
  return items.some((item) => {
    if (equalsRuntimeVals(item, needle)) {
      return true;
    }
    if (item.kind === "tag") {
      const clean = item.value.replace(/^#/, "").toLowerCase();
      return clean === needleStr || clean.startsWith(`${needleStr}/`);
    }
    return false;
  });
}

export function evalDateMethod(
  dateVal: { kind: "date"; ms: number; dateOnly: boolean },
  method: string,
  args: RuntimeVal[],
): RuntimeVal {
  if (method === "date") {
    const iso = new Date(dateVal.ms).toISOString().slice(0, 10);
    return {
      kind: "date",
      ms: Date.parse(`${iso}T00:00:00Z`),
      dateOnly: true,
    };
  }
  if (method === "time") {
    return {
      kind: "string",
      value: new Date(dateVal.ms).toISOString().slice(11, 19),
    };
  }
  if (method === "format") {
    const pattern = args[0] ? toStringVal(args[0]) : "YYYY-MM-DD";
    return { kind: "string", value: formatWithPattern(dateVal.ms, pattern) };
  }
  return NULL_VAL;
}

function formatWithPattern(ms: number, pattern: string): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return pattern
    .replace(/YYYY/g, String(d.getUTCFullYear()))
    .replace(/MM/g, pad(d.getUTCMonth() + 1))
    .replace(/DD/g, pad(d.getUTCDate()))
    .replace(/HH/g, pad(d.getUTCHours()))
    .replace(/mm/g, pad(d.getUTCMinutes()))
    .replace(/ss/g, pad(d.getUTCSeconds()));
}

export function evalCoreGlobalFunction(
  name: string,
  args: RuntimeVal[],
  nowMs: number,
): RuntimeVal | undefined {
  switch (name) {
    case "now":
      return { kind: "date", ms: nowMs, dateOnly: false };
    case "today": {
      const iso = new Date(nowMs).toISOString().slice(0, 10);
      return {
        kind: "date",
        ms: Date.parse(`${iso}T00:00:00Z`),
        dateOnly: true,
      };
    }
    case "date":
      return parseDateString(args[0] ? toStringVal(args[0]) : "") ?? NULL_VAL;
    case "duration": {
      const ms = parseDurationMs(args[0] ? toStringVal(args[0]) : "");
      return ms !== undefined ? { kind: "duration", ms } : NULL_VAL;
    }
    default:
      return evalUtilityFunction(name, args);
  }
}

function evalUtilityFunction(
  name: string,
  args: RuntimeVal[],
): RuntimeVal | undefined {
  if (name === "number") {
    const n = args[0] ? toNumberVal(args[0]) : Number.NaN;
    return Number.isFinite(n) ? { kind: "number", value: n } : NULL_VAL;
  }
  if (name === "list") {
    const first = args[0];
    if (!first) {
      return { kind: "list", items: [] };
    }
    return first.kind === "list" ? first : { kind: "list", items: [first] };
  }
  if (name === "link" || name === "file") {
    const target = args[0] ? toStringVal(args[0]) : "";
    const label = args[1] ? toStringVal(args[1]) : target;
    return { kind: "link", target, label };
  }
  if (name === "min" || name === "max") {
    const nums = args
      .map((a) => toNumberVal(a))
      .filter((n) => Number.isFinite(n));
    if (nums.length === 0) {
      return NULL_VAL;
    }
    return {
      kind: "number",
      value: name === "min" ? Math.min(...nums) : Math.max(...nums),
    };
  }
  return undefined;
}
