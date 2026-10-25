import type { BaseNoteEntry } from "./types";
import {
  evalCoreGlobalFunction,
  evalDateMethod,
  evalListMethod,
  evalNumberMethod,
  evalStringMethod,
} from "./value-methods";
import {
  NULL_VAL,
  fromRawValue,
  isEmptyVal,
  stripMdExt,
  toStringVal,
  type RuntimeVal,
} from "./values";

export function readFileField(entry: BaseNoteEntry, field: string): RuntimeVal {
  const lower = field.toLowerCase();
  switch (lower) {
    case "file":
      return { kind: "file", entry };
    case "name":
    case "basename":
      return { kind: "string", value: entry.basename };
    case "fullname":
      return {
        kind: "string",
        value: entry.extension
          ? `${entry.basename}.${entry.extension}`
          : entry.basename,
      };
    case "path":
      return { kind: "string", value: entry.path };
    case "folder":
      return { kind: "string", value: folderOfPath(entry.path) };
    case "ext":
    case "extension":
      return { kind: "string", value: entry.extension };
    case "size":
      return { kind: "number", value: entry.size };
    case "mtime":
    case "ctime":
      return { kind: "date", ms: entry.mtime, dateOnly: false };
    default:
      return readFileListField(entry, lower);
  }
}

function readFileListField(entry: BaseNoteEntry, lower: string): RuntimeVal {
  if (lower === "tags") {
    return {
      kind: "list",
      items: entry.tags.map((t) => ({
        kind: "tag",
        value: t.startsWith("#") ? t : `#${t}`,
      })),
    };
  }
  if (lower === "links" || lower === "outlinks") {
    return {
      kind: "list",
      items: entry.links.map((target) => ({
        kind: "link",
        target,
        label: stripMdExt(target),
      })),
    };
  }
  if (lower === "embeds") {
    return {
      kind: "list",
      items: entry.embeds.map((target) => ({
        kind: "link",
        target,
        label: stripMdExt(target),
      })),
    };
  }
  if (lower === "backlinks") {
    return {
      kind: "list",
      items: entry.backlinks.map((target) => ({
        kind: "link",
        target,
        label: stripMdExt(target),
      })),
    };
  }
  return NULL_VAL;
}

export function folderOfPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(0, idx) : "/";
}

export function readNoteProperty(
  entry: BaseNoteEntry,
  propName: string,
): RuntimeVal {
  const fm = entry.frontmatter;
  if (!fm) {
    return NULL_VAL;
  }
  if (propName in fm) {
    return fromRawValue(fm[propName]);
  }
  const lower = propName.toLowerCase();
  for (const [k, v] of Object.entries(fm)) {
    if (k.toLowerCase() === lower) {
      return fromRawValue(v);
    }
  }
  return NULL_VAL;
}

export function fileHasTag(entry: BaseNoteEntry, rawTag: string): boolean {
  const target = rawTag.trim().replace(/^#/, "").toLowerCase();
  if (!target) {
    return false;
  }
  return entry.tags.some((tag) => {
    const clean = tag.replace(/^#/, "").toLowerCase();
    return clean === target || clean.startsWith(`${target}/`);
  });
}

export function fileInFolder(entry: BaseNoteEntry, rawFolder: string): boolean {
  const target = rawFolder
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
  if (!target) {
    return true;
  }
  const folder = folderOfPath(entry.path)
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
  return folder === target || folder.startsWith(`${target}/`);
}

function linkTargetString(targetArg: RuntimeVal): string {
  if (targetArg.kind === "file") {
    return targetArg.entry.path;
  }
  if (targetArg.kind === "link") {
    return targetArg.target;
  }
  return toStringVal(targetArg);
}

export function fileHasLink(
  entry: BaseNoteEntry,
  targetArg: RuntimeVal,
): boolean {
  const rawTarget = linkTargetString(targetArg);
  const needle = stripMdExt(rawTarget.trim().replace(/\\/g, "/")).toLowerCase();
  if (!needle) {
    return false;
  }
  const needleBase = needle.split("/").pop() ?? needle;
  return entry.links.some((link) => {
    const clean = stripMdExt(link.replace(/\\/g, "/")).toLowerCase();
    const base = clean.split("/").pop() ?? clean;
    return clean === needle || base === needleBase;
  });
}

export function fileHasProperty(
  entry: BaseNoteEntry,
  propName: string,
): boolean {
  const fm = entry.frontmatter;
  if (!fm) {
    return false;
  }
  const clean = propName.replace(/^note\./, "").toLowerCase();
  return Object.keys(fm).some((k) => k.toLowerCase() === clean);
}

export function evalMemberAccess(
  target: RuntimeVal,
  property: string,
): RuntimeVal {
  if (target.kind === "file") {
    return readFileField(target.entry, property);
  }
  if (target.kind === "string" || target.kind === "list") {
    if (property === "length") {
      const len =
        target.kind === "string" ? target.value.length : target.items.length;
      return { kind: "number", value: len };
    }
  }
  if (target.kind === "date") {
    return readDateField(target.ms, property);
  }
  if (target.kind === "duration") {
    return readDurationField(target.ms, property);
  }
  return NULL_VAL;
}

function readDateField(ms: number, property: string): RuntimeVal {
  const d = new Date(ms);
  switch (property) {
    case "year":
      return { kind: "number", value: d.getUTCFullYear() };
    case "month":
      return { kind: "number", value: d.getUTCMonth() + 1 };
    case "day":
      return { kind: "number", value: d.getUTCDate() };
    case "hour":
      return { kind: "number", value: d.getUTCHours() };
    case "minute":
      return { kind: "number", value: d.getUTCMinutes() };
    case "second":
      return { kind: "number", value: d.getUTCSeconds() };
    case "millisecond":
      return { kind: "number", value: d.getUTCMilliseconds() };
    default:
      return NULL_VAL;
  }
}

function readDurationField(ms: number, property: string): RuntimeVal {
  switch (property) {
    case "days":
    case "day":
      return { kind: "number", value: ms / 86_400_000 };
    case "hours":
    case "hour":
      return { kind: "number", value: ms / 3_600_000 };
    case "minutes":
    case "minute":
      return { kind: "number", value: ms / 60_000 };
    case "seconds":
    case "second":
      return { kind: "number", value: ms / 1000 };
    case "milliseconds":
      return { kind: "number", value: ms };
    default:
      return NULL_VAL;
  }
}

export function evalMethodCall(
  receiver: RuntimeVal,
  method: string,
  args: RuntimeVal[],
): RuntimeVal {
  if (method === "isEmpty") {
    return { kind: "boolean", value: isEmptyVal(receiver) };
  }
  if (method === "toString") {
    return { kind: "string", value: toStringVal(receiver) };
  }
  if (method === "isTruthy") {
    return { kind: "boolean", value: !isEmptyVal(receiver) };
  }
  if (receiver.kind === "file") {
    return evalFileMethod(receiver.entry, method, args);
  }
  if (receiver.kind === "list") {
    return evalListMethod(receiver.items, method, args);
  }
  if (receiver.kind === "number") {
    return evalNumberMethod(receiver.value, method, args);
  }
  if (receiver.kind === "date") {
    return evalDateMethod(receiver, method, args);
  }
  if (receiver.kind === "regexp" && method === "matches") {
    const str = args[0] ? toStringVal(args[0]) : "";
    return { kind: "boolean", value: receiver.regex.test(str) };
  }
  if (receiver.kind === "link" && method === "asFile") {
    return receiver;
  }
  return evalStringMethod(toStringVal(receiver), method, args);
}

function evalFileMethod(
  entry: BaseNoteEntry,
  method: string,
  args: RuntimeVal[],
): RuntimeVal {
  switch (method) {
    case "hasTag":
      return {
        kind: "boolean",
        value: args.some((arg) => fileHasTag(entry, toStringVal(arg))),
      };
    case "inFolder":
      return {
        kind: "boolean",
        value: args[0] ? fileInFolder(entry, toStringVal(args[0])) : false,
      };
    case "hasLink":
      return {
        kind: "boolean",
        value: args[0] ? fileHasLink(entry, args[0]) : false,
      };
    case "hasProperty":
      return {
        kind: "boolean",
        value: args[0] ? fileHasProperty(entry, toStringVal(args[0])) : false,
      };
    case "asLink": {
      const display = args[0] ? toStringVal(args[0]) : entry.basename;
      return { kind: "link", target: entry.path, label: display };
    }
    default:
      return NULL_VAL;
  }
}

export function evalGlobalFunction(
  name: string,
  args: RuntimeVal[],
  defaultEntry: BaseNoteEntry,
  nowMs: number,
): RuntimeVal {
  const core = evalCoreGlobalFunction(name, args, nowMs);
  if (core !== undefined) {
    return core;
  }
  const entry = args[0]?.kind === "file" ? args[0].entry : defaultEntry;
  const second = args[1] ? toStringVal(args[1]) : "";
  if (name === "taggedWith") {
    return { kind: "boolean", value: fileHasTag(entry, second) };
  }
  if (name === "inFolder") {
    return { kind: "boolean", value: fileInFolder(entry, second) };
  }
  return NULL_VAL;
}
