/**
 * Clipboard text for a bridge envelope. Markdown matches the LLM Wiki
 * `@path#start-end` wording; PDF matches PDF Workshop's short link + quote.
 * The structured envelope is separate and is not appended here.
 */

/** The reference, a blank line, then the selection quoted line by line. */
export { notePayload as markdownHandoffText } from "@workshop/agents/handoff";

export interface PdfHandoffInput {
  readonly path: string;
  readonly page: number;
  readonly viewRect?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /** Unused in clipboard text; kept so envelope callers need not change. */
  readonly sourceSha256?: string;
  readonly text: string;
}

/** One-page link and blockquote, the form PDF Workshop copies. */
export function pdfHandoffText(input: PdfHandoffInput): string {
  const target = pdfTarget(input);
  const slash = Math.max(
    input.path.lastIndexOf("/"),
    input.path.lastIndexOf("\\"),
  );
  const basename = slash >= 0 ? input.path.slice(slash + 1) : input.path;
  const link = `[${basename} · p.${input.page}](${target})`;
  const body = input.text.replace(/\r\n?/gu, "\n").replace(/\n+$/u, "");
  if (!body) {
    return link;
  }
  const quoted = body
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
  return `${link}\n\n${quoted}`;
}

export function pdfTarget(input: {
  readonly path: string;
  readonly page: number;
  readonly viewRect?: PdfHandoffInput["viewRect"];
}): string {
  const page = `${input.path}#page=${input.page}`;
  const rect = input.viewRect;
  if (!rect) {
    return page;
  }
  const box = [rect.x, rect.y, rect.width, rect.height].join(",");
  return `${page}&viewrect=${box}`;
}
