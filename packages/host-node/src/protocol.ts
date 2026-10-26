/**
 * What the editor page and the host send each other over a panel's socket.
 * `rpc` frames carry Lumière's own RPC envelopes unchanged (the editor
 * validates those itself); `ui` frames are the few things VS Code would do
 * for the extension, such as toasts, prompts and opening another note.
 * The page is untrusted: the host parses everything it sends.
 */

/** Something the host asks the page to show or do. */
export type UiRequest =
  | { type: "toast"; kind: "info" | "error"; message: string }
  | { type: "clipboard"; text: string }
  | { type: "ask"; id: number; message: string; actions: string[] }
  | { type: "pick"; id: number; placeholder: string; items: PickRow[] }
  | { type: "pickItems"; id: number; items: PickRow[] }
  | { type: "input"; id: number; prompt: string; value: string; error?: string }
  /**
   * The right-click menu at (x, y): Lumière's items in groups. Answered with
   * the index of the chosen command row, counting down the groups and into
   * each submenu where it stands.
   */
  | { type: "menu"; id: number; x: number; y: number; groups: MenuRow[][] }
  | { type: "open"; path: string; fragment: string }
  | { type: "external"; href: string };

/** One item of the right-click menu, without its command; a submenu's row holds its own rows. */
export interface MenuRow {
  label: string;
  submenu?: MenuRow[][];
}

/** One row of a pick list, without the host's value. */
export interface PickRow {
  label: string;
  description?: string;
  detail?: string;
}

/** Something the page tells the host. */
export type UiEvent =
  | { type: "focus" }
  | { type: "blur" }
  /** An `ask` action, a `pick` row index or `input` text; null when dismissed. */
  | { type: "answer"; id: number; value: string | number | null }
  | { type: "query"; id: number; query: string }
  /**
   * The reader right-clicked at (x, y). `context` is VS Code's webview
   * context: the `data-vscode-context` of the element and its parents.
   */
  | { type: "contextmenu"; x: number; y: number; context: MenuContext };

/** Simple values only; the host checks the keys and sizes. */
export type MenuContext = Record<string, string | number | boolean>;

export type HostFrame =
  { ch: "rpc"; data: unknown } | { ch: "ui"; data: UiRequest };

export type PageFrame =
  { ch: "rpc"; data: unknown } | { ch: "ui"; data: UiEvent };

const MAX_TEXT = 64 * 1024;

/** Schemes the page must not open. The host refuses them too; this is the sink. */
const UNSAFE_EXTERNAL = new Set([
  "javascript:",
  "data:",
  "file:",
  "vbscript:",
  "command:",
]);

/**
 * An http(s), mailto or other application link safe to hand to `window.open`,
 * or undefined for a scheme that can run a script or read a local file.
 */
export function safeExternalHref(href: string): string | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  if (UNSAFE_EXTERNAL.has(url.protocol)) {
    return undefined;
  }
  return url.href;
}

/** A frame from the host, or undefined when it is not one. */
export function parseHostFrame(text: string): HostFrame | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.ch === "rpc" && "data" in value) {
    return { ch: "rpc", data: value.data };
  }
  if (
    value.ch === "ui" &&
    isRecord(value.data) &&
    typeof value.data.type === "string"
  ) {
    return { ch: "ui", data: value.data as UiRequest };
  }
  return undefined;
}

/** A frame from the page, or undefined when it is not one. */
export function parsePageFrame(text: string): PageFrame | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.ch === "rpc" && "data" in value) {
    return { ch: "rpc", data: value.data };
  }
  if (value.ch === "ui") {
    const event = parseUiEvent(value.data);
    return event ? { ch: "ui", data: event } : undefined;
  }
  return undefined;
}

function parseUiEvent(value: unknown): UiEvent | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  switch (value.type) {
    case "focus":
    case "blur":
      return { type: value.type };
    case "answer":
      return isId(value.id) && isAnswer(value.value)
        ? { type: "answer", id: value.id, value: value.value }
        : undefined;
    case "query":
      return isId(value.id) && isText(value.query)
        ? { type: "query", id: value.id, query: value.query }
        : undefined;
    case "contextmenu":
      return parseContextMenu(value);
    default:
      return undefined;
  }
}

const MAX_CONTEXT_KEYS = 32;

function parseContextMenu(value: Record<string, unknown>): UiEvent | undefined {
  const { x, y, context } = value;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !isRecord(context)
  ) {
    return undefined;
  }
  const entries = Object.entries(context);
  if (entries.length > MAX_CONTEXT_KEYS) {
    return undefined;
  }
  const kept: MenuContext = {};
  for (const [key, item] of entries) {
    if (
      key.length <= 200 &&
      (typeof item === "boolean" ||
        (typeof item === "number" && Number.isFinite(item)) ||
        (typeof item === "string" && item.length <= 500))
    ) {
      kept[key] = item;
    }
  }
  return { type: "contextmenu", x, y, context: kept };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_TEXT;
}

function isAnswer(value: unknown): value is string | number | null {
  return (
    value === null ||
    isText(value) ||
    (Number.isSafeInteger(value) && (value as number) >= 0)
  );
}
