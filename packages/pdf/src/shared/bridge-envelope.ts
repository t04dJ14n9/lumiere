/**
 * Versioned selection envelope shared with Lumière.
 *
 * The clipboard text of Copy Link for Agent is unchanged (see
 * `packages/agents/docs/agent-handoff-format.md`). This object is what
 * `vscodeEmbedPdf.bridge.envelope` returns. It matches the Workbench v1
 * `BridgeEnvelope` contract that Lumière's `parseBridgeEnvelope`
 * already consumes (see that extension's `docs/bridge-envelope.md`):
 *
 * - `source.identity` / `kind` / `media` name the file. `revision.sourceSha256`
 *   hashes the whole PDF when the source is saved.
 * - `locator.durable` is one reopen link built from a URI-safe base
 *   (`file:…` / encoded path + `#page=N&viewrect=…`), not the human
 *   `source.identity` (which may contain `#`). `locator.pdf` carries the
 *   same page and box as structured fields.
 * - `view.id` names the open pane only. It is not a path and not a locator.
 * - `capturedAt` is when the user made the selection.
 * - `selection.sha256` hashes the selection alone (`selectionCanonical`), not
 *   the file.
 *
 * `producer` is `"pdf"`. Lumière uses the same version and
 * `producer: "markdown"`. Workshop is the aggregator: it returns a Markdown
 * selection when it has one, otherwise it calls this command. This command
 * does not call Workshop back, so the two cannot recurse. See
 * `docs/bridge-envelope.md`.
 */
import { boundingRect, toViewRect } from "./geometry";
import { pdfLink } from "./pdf-location";
import { selectedPages, type PdfSelection } from "./selection";

export const BRIDGE_ENVELOPE_VERSION = 1;

export const PDF_BRIDGE_PRODUCER = "pdf" as const;

export const PDF_BRIDGE_ENVELOPE_COMMAND = "vscodeEmbedPdf.bridge.envelope";

/** Soft peer command. Renamed with Lumière; absent when it is not installed. */
export const MARKDOWN_BRIDGE_ENVELOPE_COMMAND =
  "lumiere.markdown.bridge.envelope";

/** Workbench v1 view rectangle: corner and size in PDF points. */
export interface BridgeViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Workbench v1 bridge envelope (`producer: "pdf"`). Field names must stay
 * aligned with Lumière's `parseBridgeEnvelope`.
 */
export interface PdfBridgeEnvelope {
  readonly version: typeof BRIDGE_ENVELOPE_VERSION;
  readonly producer: typeof PDF_BRIDGE_PRODUCER;
  /** When the user made this selection. */
  readonly capturedAt: string;
  readonly source: {
    readonly identity: string;
    readonly kind: "file" | "remote";
    readonly media: "pdf";
    readonly publishedAt?: string;
    readonly title?: string;
  };
  readonly locator: {
    readonly durable: string;
    readonly pdf: {
      readonly page: number;
      readonly viewRect?: BridgeViewRect;
    };
  };
  readonly view?: { readonly id: string };
  readonly selection: { readonly text: string; readonly sha256: string };
  readonly revision: {
    readonly documentVersion?: number;
    readonly sourceSha256?: string;
    readonly isDirty: boolean;
  };
}

/**
 * UTF-8 payload hashed into `selection.sha256`. JSON keeps variable fields
 * unambiguous (text cannot embed the next page:rect line). It does not
 * include the file bytes.
 */
export function selectionCanonical(selection: PdfSelection): string {
  if (selection.kind === "text") {
    return JSON.stringify({
      v: 1,
      kind: "text",
      text: selection.text,
      pages: selectedPages(selection).map((page) => ({
        page: page.page,
        rects: page.rects.map((rect) => [rect[0], rect[1], rect[2], rect[3]]),
      })),
    });
  }
  return JSON.stringify({
    v: 1,
    kind: "region",
    page: selection.page,
    rect: [
      selection.rect[0],
      selection.rect[1],
      selection.rect[2],
      selection.rect[3],
    ],
    text: selection.text ?? "",
  });
}

/**
 * Prepare a durable reopen base before appending `#page=` / `viewrect`.
 *
 * - Already-serialized URIs (`scheme:…`, typically `panel.uri.toString()`)
 *   are opaque: keep the `?` query delimiter (and any `#` after it). Only
 *   bare `#` in the pre-query part is encoded, as a safety net for fakes
 *   that omit Uri.toString()'s path encoding (`report#draft.pdf`).
 * - Raw filesystem / relative paths still encode both `#` and `?` so those
 *   characters cannot be mistaken for fragment/query when `#page=` is added.
 */
export function durableLocatorBase(uriOrPath: string): string {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/u.test(uriOrPath)) {
    const query = uriOrPath.indexOf("?");
    if (query >= 0) {
      return (
        uriOrPath.slice(0, query).replaceAll("#", "%23") +
        uriOrPath.slice(query)
      );
    }
    return uriOrPath.replaceAll("#", "%23");
  }
  return uriOrPath.replaceAll("#", "%23").replaceAll("?", "%3F");
}

/** Primary durable `#page=` / `viewrect` link for a selection (first page). */
export function pdfSelectionDurable(
  base: string,
  selection: PdfSelection,
): string {
  const pages = selectedPages(selection);
  const first = pages[0]!;
  return pdfLink(durableLocatorBase(base), {
    page: first.page,
    viewRect: toViewRect(boundingRect(first.rects)),
  });
}

function bridgeViewRect(selection: PdfSelection): BridgeViewRect {
  const pages = selectedPages(selection);
  const { left, top, width, height } = toViewRect(
    boundingRect(pages[0]!.rects),
  );
  return { x: left, y: top, width, height };
}

export function pdfBridgeEnvelope(input: {
  capturedAt: string;
  /** Human/relative source identity (may contain `#`). */
  identity: string;
  /**
   * URI-safe base for `locator.durable` (typically `panel.uri.toString()`).
   * Must not reuse a display path that can contain `#`.
   */
  durableBase: string;
  kind?: "file" | "remote";
  viewId: string;
  selection: PdfSelection;
  selectionSha256: string;
  sourceSha256: string;
  isDirty?: boolean;
  title?: string;
  publishedAt?: string;
}): PdfBridgeEnvelope {
  const pages = selectedPages(input.selection);
  const page = pages[0]!.page;
  const viewRect = bridgeViewRect(input.selection);
  const durable = pdfSelectionDurable(input.durableBase, input.selection);
  const kind = input.kind ?? "file";
  const isDirty = input.isDirty ?? false;
  const text =
    input.selection.kind === "text"
      ? input.selection.text
      : (input.selection.text ?? "");
  if (input.viewId === durable) {
    throw new TypeError("A view id is not a durable locator.");
  }
  return {
    version: BRIDGE_ENVELOPE_VERSION,
    producer: PDF_BRIDGE_PRODUCER,
    capturedAt: input.capturedAt,
    source: {
      identity: input.identity,
      kind,
      media: "pdf",
      ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
      ...(input.title ? { title: input.title } : {}),
    },
    locator: {
      durable,
      pdf: { page, viewRect },
    },
    view: { id: input.viewId },
    selection: { text, sha256: input.selectionSha256 },
    revision: {
      isDirty,
      ...(!isDirty ? { sourceSha256: input.sourceSha256 } : {}),
    },
  };
}
