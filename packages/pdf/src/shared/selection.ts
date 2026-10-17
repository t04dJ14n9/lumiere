/**
 * What the reader has selected in a PDF, as the viewer reports it to the
 * extension. The webview is untrusted, so the extension accepts a selection
 * only through `parseSelection`.
 */
import { isPageRect, type PageRect } from "./geometry";

/** Highlighted text, possibly spanning pages; one rectangle per text line. */
export interface TextSelection {
  kind: "text";
  text: string;
  pages: SelectedPage[];
}

/** A box dragged over a page, for figures, tables and equations. */
export interface RegionSelection {
  kind: "region";
  page: number;
  rect: PageRect;
  /** The text inside the box, line by line, once read; missing when it has none. */
  text?: string;
}

export type PdfSelection = TextSelection | RegionSelection;

export interface SelectedPage {
  page: number;
  rects: PageRect[];
}

const MAX_TEXT_LENGTH = 100_000;
const MAX_PAGES = 500;
const MAX_RECTS_PER_PAGE = 2_000;

export function parseSelection(value: unknown): PdfSelection | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.kind === "region") {
    return parseRegionSelection(value);
  }
  return value.kind === "text" ? parseTextSelection(value) : undefined;
}

function parseRegionSelection(
  value: Record<string, unknown>,
): PdfSelection | undefined {
  if (!isPageNumber(value.page) || !isPageRect(value.rect)) {
    return undefined;
  }
  const text =
    typeof value.text === "string"
      ? value.text.trim().slice(0, MAX_TEXT_LENGTH)
      : "";
  return {
    kind: "region",
    page: value.page,
    rect: value.rect,
    ...(text ? { text } : {}),
  };
}

function parseTextSelection(
  value: Record<string, unknown>,
): PdfSelection | undefined {
  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (!text || text.length > MAX_TEXT_LENGTH) {
    return undefined;
  }
  const pages = parseSelectedPages(value.pages);
  return pages ? { kind: "text", text, pages } : undefined;
}

/** One to MAX_PAGES distinct pages, sorted; undefined if any is invalid. */
function parseSelectedPages(value: unknown): SelectedPage[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PAGES) {
    return undefined;
  }
  const pages: SelectedPage[] = [];
  for (const candidate of value as unknown[]) {
    const page = parseSelectedPage(candidate);
    if (!page || pages.some((existing) => existing.page === page.page)) {
      return undefined;
    }
    pages.push(page);
  }
  return pages.sort((left, right) => left.page - right.page);
}

/** The pages a selection covers, first to last. */
export function selectedPages(selection: PdfSelection): SelectedPage[] {
  return selection.kind === "text"
    ? selection.pages
    : [{ page: selection.page, rects: [selection.rect] }];
}

function parseSelectedPage(value: unknown): SelectedPage | undefined {
  if (
    !isRecord(value) ||
    !isPageNumber(value.page) ||
    !Array.isArray(value.rects)
  ) {
    return undefined;
  }
  const rects = value.rects as unknown[];
  if (
    rects.length === 0 ||
    rects.length > MAX_RECTS_PER_PAGE ||
    !rects.every(isPageRect)
  ) {
    return undefined;
  }
  return { page: value.page, rects: rects as PageRect[] };
}

function isPageNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
