/**
 * The text that Copy Link for Agent puts on the clipboard (and types into an
 * agent chat): a short Markdown link to the page and box, then the selected
 * text as a blockquote. For example:
 *
 *     [attention.pdf · p.3](papers/attention.pdf#page=3&viewrect=72,83,134,21)
 *
 *     > Scaled dot-product attention
 *
 * The href keeps `#page=` and `viewrect=` so PDF: Open Location can reopen
 * the spot. The label is basename · p.N so pastes stay short in chat.
 *
 * A multi-page selection links the first page (where the selection starts)
 * and still quotes the full text. A region with no text is the link alone.
 * Region PNG snapshots are attached by the handoff, not written here.
 */
import { boundingRect, toViewRect, type PageRect } from "./geometry";
import { pdfLink } from "./pdf-location";
import { selectedPages, type PdfSelection } from "./selection";

export interface PdfSource {
  /** Workspace-relative path, or an absolute path for files outside it. */
  path: string;
  /**
   * SHA-256 of the PDF bytes (used by the structured envelope, not the
   * clipboard text).
   */
  sha256?: string;
}

/** Kept for call-site compatibility; region images are attached, not pasted. */
export type SelectionFiles = {
  regionImage?: string;
};

/** Cap quoted text so a huge selection does not flood the agent chat. */
const MAX_QUOTE_CHARS = 8_000;

export function agentText(
  selection: PdfSelection,
  source: PdfSource,
  _files: SelectionFiles = {},
): string {
  const page = primaryPage(selection);
  const href = pdfLink(source.path, {
    page: page.page,
    viewRect: toViewRect(boundingRect(page.rects)),
  });
  const label = `${fileName(source.path)} · p.${page.page}`;
  const link = `[${label}](${href})`;
  const body = selectedBody(selection);
  if (!body) {
    return link;
  }
  return `${link}\n\n${asBlockquote(truncate(body, MAX_QUOTE_CHARS))}`;
}

function primaryPage(selection: PdfSelection): {
  page: number;
  rects: readonly PageRect[];
} {
  if (selection.kind === "region") {
    return { page: selection.page, rects: [selection.rect] };
  }
  const first = selectedPages(selection)[0]!;
  return { page: first.page, rects: first.rects };
}

function selectedBody(selection: PdfSelection): string {
  const raw =
    selection.kind === "text" ? selection.text : (selection.text ?? "");
  return raw.replace(/\r\n?/gu, "\n").replace(/\n+$/u, "");
}

/** Quote every line with `> `, matching the note handoff style. */
function asBlockquote(text: string): string {
  return text
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars - 1)}…`;
}

/** Last path segment; shared has no Node `path` API. */
function fileName(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return slash >= 0 ? path.slice(slash + 1) : path;
}
