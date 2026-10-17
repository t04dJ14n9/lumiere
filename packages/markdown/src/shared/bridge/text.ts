/**
 * Clipboard text for a bridge envelope. Markdown matches the LLM Wiki
 * `@path#start-end` wording; PDF matches PDF Workshop's Source link.
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
  readonly sourceSha256: string;
  readonly text: string;
}

/** One-page Source link, the form PDF Workshop copies. */
export function pdfHandoffText(input: PdfHandoffInput): string {
  const target = pdfTarget(input);
  const label = `${input.path} (page ${input.page})`;
  const body = input.text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  return [
    `Source: [${label}](<${target}>)`,
    `PDF source SHA-256: \`${input.sourceSha256}\``,
    "",
    "Selected text:",
    body,
    "",
    "When you answer, cite the Source link above so the reader can reopen this spot in the PDF.",
  ].join("\n");
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
