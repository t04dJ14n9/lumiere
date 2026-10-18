/**
 * The text that Copy Link for Agent puts on the clipboard (and types into an
 * agent chat): a Markdown link to the page box, then the selection as a
 * blockquote. For example:
 *
 *     [attention.pdf · p.3](papers/attention.pdf#page=3&viewrect=72,83,134,21)
 *
 *     > Scaled dot-product attention
 *
 * Href is only `path#page=&viewrect=` (RFC 8118). No Source: prefix, no file
 * hash, no cite instruction, no Markdown escapes in the label. The lines
 * match LLM Wiki's agent clipboard shape (link, blank line, `> ` quote), so
 * agents and skills that read one also read the other.
 *
 * A region uses the same link shape; any text found inside the box is quoted.
 * Region image paths are not copied (chat attachment / MCP can still attach a
 * snapshot separately).
 */
import { boundingRect, toViewRect } from "./geometry";
import { pdfLink } from "./pdf-location";
import { selectedPages, type PdfSelection } from "./selection";

export interface PdfSource {
  /** Workspace-relative path, or an absolute path for files outside it. */
  path: string;
}

/** Quote every line with `> `, matching packages/agents note handoff. */
function blockquote(text: string): string {
  const lines = text.replace(/\r\n?/gu, "\n").replace(/\n+$/u, "").split("\n");
  return lines.map((line) => (line ? `> ${line}` : ">")).join("\n");
}

/** Last path segment of a workspace path or file URL path. */
function fileBasename(path: string): string {
  const cleaned = path.replace(/\\/gu, "/");
  const noQuery = cleaned.split(/[?#]/u, 1)[0] ?? cleaned;
  const slash = noQuery.lastIndexOf("/");
  return slash >= 0 ? noQuery.slice(slash + 1) : noQuery;
}

export function agentText(selection: PdfSelection, source: PdfSource): string {
  const name = fileBasename(source.path);
  const links = selectedPages(selection).map(({ page, rects }) => {
    const label = `${name} · p.${page}`;
    const href = pdfLink(source.path, {
      page,
      viewRect: toViewRect(boundingRect(rects)),
    });
    return `[${label}](${href})`;
  });
  const body = selection.text?.trim() ? blockquote(selection.text) : undefined;
  return [...links, ...(body ? ["", body] : [])].join("\n");
}
