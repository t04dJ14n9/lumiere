/**
 * Every message between the extension (host) and the PDF viewer (webview).
 *
 *   host                              viewer
 *    │  ◄──────────── ready               the page has loaded
 *    │  load { load, data } ────►         the PDF bytes, numbered
 *    │  ◄──────────── patch { version, load, patch }
 *    │                                    what changed in the viewer's state:
 *    │                                    outline, selection (for a region,
 *    │                                    again with its text and image), view
 *    │                                    (page and zoom)
 *    │  ◄──────────── copyLinkForAgent    Copy Link for Agent (host / tests)
 *    │  ◄──────────── toggleOutline       the viewer bar's outline button
 *    │  ◄──────────── floatingDock        the floating bar dragged to an edge
 *    │  ◄──────────── openExternal        a web link clicked in the PDF
 *    │  goTo { location } ──────►         open a page (and box)
 *    │  action { action } ──────►         page, zoom, find or tool, from a command
 *    │  toolbar { toolbar } ────►         the toolbar setting changed
 *    │  lookUp { enabled } ─────►         macOS Look Up is on or off
 *    │  zen { on } ─────────────►         zen mode is on or off (floating bar while it lasts)
 *    │  ◄──────────── zen                 Exit zen pressed, or full-screen zen ended
 *    │  ◄──────────── lookUp              the word under a force click (open),
 *    │                                    or under a right click (to look up
 *    │                                    from the context menu)
 *
 * State reports are batched: the viewer collects what changed for a frame
 * and sends one `patch` (only the latest of each part), so scrolling or a
 * drag sends one message per frame, not one per event.
 *
 * Invariants:
 *
 * - Order: a pending patch is sent before any other viewer message, so the
 *   host always has the selection before a Copy Link for Agent that follows.
 * - Versions: patches are numbered 1, 2, 3… for the life of the page, and
 *   the host applies a patch only if its version is newer than the last one
 *   applied. `load` is the number of the last `load` message the viewer had
 *   received when it sent the patch (the host numbers them 1, 2, 3… for the
 *   life of the panel, across viewer pages); the host drops a patch from an
 *   earlier load, so state reported for the old bytes never lands on the new
 *   ones. The viewer echoes the number rather than counting for itself: a
 *   load sent before a new page said `ready` can still reach that page.
 *
 * The viewer runs untrusted PDF content, so the host validates what it
 * receives with `parseViewerMessage`.
 */
import { isLookUpWord } from "./look-up";
import type { PdfLocation } from "./pdf-location";
import { parseSelection, type PdfSelection } from "./selection";
import {
  isFloatingDock,
  type FloatingDock,
  type ToolbarSettings,
} from "./toolbar-settings";
import {
  parseViewState,
  type ViewerAction,
  type ViewState,
} from "./view-state";
import { parseReadingPosition, type ReadingPosition } from "./reading-position";
import type { ViewSettings } from "./view-settings";

/** One entry of the PDF's outline (bookmarks), with the page it opens. */
export interface OutlineItem {
  title: string;
  /** Missing for entries that only group others or point outside the PDF. */
  page?: number;
  /** How far down the page the entry opens, in points from its top; missing for the top. */
  top?: number;
  children: OutlineItem[];
}

/** A selection as the viewer reports it. */
export interface SelectionReport {
  selection: PdfSelection | null;
  /** For a region, a PNG of the box as a `data:image/png;base64,` URL. */
  image?: string;
}

/** The parts of the viewer's state that changed; each is the latest value. */
export interface ViewerPatch {
  outline?: OutlineItem[];
  selection?: SelectionReport;
  view?: ViewState;
}

export type ViewerMessage =
  | { type: "ready" }
  | {
      type: "historyJump";
      load: number;
      id: number;
      from: ReadingPosition;
      to: ReadingPosition;
      requestId?: number;
    }
  | { type: "historyTraverse"; load: number; direction: "back" | "forward" }
  | {
      type: "historyCaptured";
      load: number;
      token: number;
      position: ReadingPosition;
      intent: number;
      ok: boolean;
      startedToken?: number;
    }
  | {
      type: "historyRestored";
      load: number;
      token: number;
      position: ReadingPosition;
      intent: number;
      ok: boolean;
      startedToken?: number;
    }
  | { type: "patch"; version: number; load: number; patch: ViewerPatch }
  | { type: "copyLinkForAgent" }
  /** The viewer's outline button: show or hide the PDF Outline view. */
  | { type: "toggleOutline" }
  /** The floating bar was dragged to another edge. */
  | { type: "floatingDock"; dock: FloatingDock }
  | { type: "openExternal"; url: string }
  /** macOS Look Up: `open` looks the word up now (a force click), else when the context menu asks. */
  | { type: "lookUp"; word: string | null; open: boolean }
  /** Zen mode: `exit` the reader pressed Exit zen; otherwise the window left full-screen zen by itself. */
  | { type: "zen"; exit: boolean }
  | { type: "error"; message: string };

export type HostMessage =
  | {
      type: "load";
      /** This load's number: see the invariants above. */
      load: number;
      data: ArrayBuffer;
      settings: ViewSettings;
      position?: ReadingPosition;
    }
  /** `top`: with no box, show the page from this many points below its top. */
  | {
      type: "goTo";
      location: PdfLocation;
      top?: number | undefined;
      requestId?: number;
      expectedIntent?: number;
    }
  | { type: "historyState"; back: boolean; forward: boolean }
  | { type: "historyCapture"; token: number }
  | { type: "historyCancel"; token?: number }
  | {
      type: "historyRestore";
      token: number;
      position: ReadingPosition;
      expectedIntent: number;
    }
  | { type: "action"; action: ViewerAction }
  | { type: "toolbar"; toolbar: ToolbarSettings }
  | { type: "lookUp"; enabled: boolean }
  | { type: "lookUpRequest" }
  /** Zen mode is on or off: the viewer shows a floating bar while it lasts. */
  | { type: "zen"; on: boolean }
  | { type: "viewSettings"; settings: ViewSettings };

const MAX_OUTLINE_ITEMS = 10_000;
const MAX_OUTLINE_DEPTH = 32;
const MAX_TITLE_LENGTH = 500;
/** Larger than any real page, in points (PDF pages are at most 14,400 points). */
const MAX_PAGE_OFFSET = 1_000_000;
/** About 6 MB of PNG; region snapshots are capped at 2,000 pixels a side. */
const MAX_IMAGE_LENGTH = 8_000_000;

/** Accept a message from the viewer only if it is well-formed. */
export function parseViewerMessage(value: unknown): ViewerMessage | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const message = value as Record<string, unknown>;
  const parse =
    typeof message.type === "string" ? VIEWER_PARSERS[message.type] : undefined;
  return parse?.(message);
}

type Fields = Record<string, unknown>;

/** One parser per viewer message type; each checks every field. */
const VIEWER_PARSERS: Readonly<
  Record<string, (message: Fields) => ViewerMessage | undefined>
> = {
  historyJump: parseHistoryJump,
  historyTraverse: (message) =>
    validHistoryNumber(message.load, 0) &&
    (message.direction === "back" || message.direction === "forward")
      ? {
          type: "historyTraverse",
          load: message.load,
          direction: message.direction,
        }
      : undefined,
  historyCaptured: parseHistoryReport,
  historyRestored: parseHistoryReport,
  ready: () => ({ type: "ready" }),
  copyLinkForAgent: () => ({ type: "copyLinkForAgent" }),
  toggleOutline: () => ({ type: "toggleOutline" }),
  patch: (message) => parsePatchMessage(message),
  floatingDock: (message) =>
    isFloatingDock(message.dock)
      ? { type: "floatingDock", dock: message.dock }
      : undefined,
  openExternal: (message) =>
    isWebUrl(message.url)
      ? { type: "openExternal", url: message.url }
      : undefined,
  lookUp: (message) =>
    typeof message.open === "boolean" &&
    (message.word === null || isLookUpWord(message.word))
      ? { type: "lookUp", word: message.word, open: message.open }
      : undefined,
  zen: (message) =>
    typeof message.exit === "boolean"
      ? { type: "zen", exit: message.exit }
      : undefined,
  error: (message) =>
    typeof message.message === "string"
      ? { type: "error", message: message.message.slice(0, 1_000) }
      : undefined,
};

function parseHistoryJump(message: Fields): ViewerMessage | undefined {
  const from = parseReadingPosition(message.from);
  const to = parseReadingPosition(message.to);
  const requestId = message.requestId;
  if (
    !validHistoryNumber(message.load, 0) ||
    !validHistoryNumber(message.id, 1) ||
    !from ||
    !to ||
    (requestId !== undefined && !validHistoryNumber(requestId, 1))
  ) {
    return undefined;
  }
  return {
    type: "historyJump",
    load: message.load,
    id: message.id,
    from,
    to,
    ...(requestId === undefined ? {} : { requestId }),
  };
}

/** `historyCaptured` and `historyRestored` carry the same fields. */
function parseHistoryReport(message: Fields): ViewerMessage | undefined {
  const position = parseReadingPosition(message.position);
  const startedToken = message.startedToken;
  if (
    (message.type !== "historyCaptured" &&
      message.type !== "historyRestored") ||
    !validHistoryNumber(message.load, 0) ||
    !validHistoryNumber(message.token, 1) ||
    !validHistoryNumber(message.intent, 0) ||
    !position ||
    typeof message.ok !== "boolean" ||
    (startedToken !== undefined && !validHistoryNumber(startedToken, 0))
  ) {
    return undefined;
  }
  return {
    type: message.type,
    load: message.load,
    token: message.token,
    position,
    intent: message.intent,
    ok: message.ok,
    ...(startedToken === undefined ? {} : { startedToken }),
  };
}

function validHistoryNumber(value: unknown, minimum: number): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= minimum
  );
}

/**
 * Whether the host should apply `patch`: newer than the last one it applied
 * (`lastVersion`), and about the bytes it sent last (`loads` sent so far).
 */
export function isCurrentPatch(
  patch: { version: number; load: number },
  lastVersion: number,
  loads: number,
): boolean {
  return patch.version > lastVersion && patch.load === loads;
}

function parsePatchMessage(
  message: Record<string, unknown>,
): ViewerMessage | undefined {
  const { version, load } = message;
  if (!Number.isSafeInteger(version) || (version as number) < 1) {
    return undefined;
  }
  if (!Number.isSafeInteger(load) || (load as number) < 0) {
    return undefined;
  }
  const patch = parsePatch(message.patch);
  return patch
    ? { type: "patch", version: version as number, load: load as number, patch }
    : undefined;
}

/** A patch's parts; a malformed view rejects the patch, a malformed selection reads as none. */
function parsePatch(value: unknown): ViewerPatch | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { outline, selection, view } = value as Record<string, unknown>;
  const patch: ViewerPatch = {};
  if (outline !== undefined) {
    patch.outline = parseOutline(outline);
  }
  if (selection !== undefined) {
    patch.selection = parseSelectionReport(selection);
  }
  if (view !== undefined) {
    const parsed = parseViewState(view);
    if (!parsed) {
      return undefined;
    }
    patch.view = parsed;
  }
  return patch;
}

function parseSelectionReport(value: unknown): SelectionReport {
  const report =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const selection = parseSelection(report.selection) ?? null;
  const image =
    selection?.kind === "region" && isPngDataUrl(report.image)
      ? report.image
      : undefined;
  return { selection, ...(image ? { image } : {}) };
}

/** A region snapshot: a PNG as a base64 data URL, of a sane size. */
function isPngDataUrl(value: unknown): value is string {
  const prefix = "data:image/png;base64,";
  return (
    typeof value === "string" &&
    value.startsWith(prefix) &&
    value.length <= MAX_IMAGE_LENGTH &&
    /^[A-Za-z0-9+/]+={0,2}$/u.test(value.slice(prefix.length))
  );
}

/** Only web and mail links may leave the viewer; a PDF can contain any URI. */
function isWebUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 8_192 &&
    /^(https?:\/\/|mailto:)\S+$/i.test(value)
  );
}

function isPageOffset(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value < MAX_PAGE_OFFSET
  );
}

function parseOutline(value: unknown): OutlineItem[] {
  let budget = MAX_OUTLINE_ITEMS;
  const visit = (items: unknown, depth: number): OutlineItem[] => {
    if (!Array.isArray(items) || depth > MAX_OUTLINE_DEPTH) {
      return [];
    }
    const result: OutlineItem[] = [];
    for (const item of items as unknown[]) {
      if (budget-- <= 0 || typeof item !== "object" || item === null) {
        break;
      }
      const { title, page, top, children } = item as Record<string, unknown>;
      if (typeof title !== "string") {
        continue;
      }
      const hasPage = Number.isSafeInteger(page) && (page as number) >= 1;
      result.push({
        title:
          title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH) ||
          "Untitled",
        ...(hasPage ? { page: page as number } : {}),
        ...(hasPage && isPageOffset(top) ? { top } : {}),
        children: visit(children, depth + 1),
      });
    }
    return result;
  };
  return visit(value, 0);
}
