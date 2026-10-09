/**
 * The text that "Copy for Agent" puts on the clipboard: where the selection
 * is (a link per page with its box), which file version it came from, and
 * what was selected. For example:
 *
 *     Source: [papers/attention.pdf (page 3)](<papers/attention.pdf#page=3&viewrect=72,83,134,21>)
 *     PDF source SHA-256: `9f86d0…`
 *
 *     Selected text:
 *     Scaled dot-product attention
 *
 * A region adds the text found inside its box and, when the extension saved
 * one, the path of a PNG snapshot of it:
 *
 *     Selected PDF region. Read the text inside the view rectangle, …
 *     Region image: `/…/region-p9-92-126-427-261.png`
 *
 *     Text in the region:
 *     base 6 512 2048 …
 *
 * The wording matches LLM Wiki's agent clipboard so agents and skills that
 * read one also read the other.
 */
import { boundingRect, toViewRect } from './geometry';
import { pdfLink } from './pdf-location';
import { selectedPages, type PdfSelection } from './selection';

export interface PdfSource {
  /** Workspace-relative path, or an absolute path for files outside it. */
  path: string;
  /** SHA-256 of the PDF bytes, so an agent can tell if the file changed. */
  sha256: string;
}

const REGION_INSTRUCTION =
  'Selected PDF region. Read the text inside the view rectangle, or render that area of the page to inspect figures and tables.';

/** Files saved alongside the selection. */
export interface SelectionFiles {
  /** Absolute path of a PNG snapshot of a region. */
  regionImage?: string;
}

export function agentText(selection: PdfSelection, source: PdfSource, files: SelectionFiles = {}): string {
  const region = selection.kind === 'region';
  const links = selectedPages(selection).map(({ page, rects }) => {
    const label = `${source.path} (page ${page}${region ? ' region' : ''})`;
    const href = pdfLink(source.path, { page, viewRect: toViewRect(boundingRect(rects)) });
    return `[${escapeLinkLabel(label)}](<${href}>)`;
  });
  return [
    ...(links.length === 1 ? [`Source: ${links[0]}`] : ['Sources:', ...links.map(link => `- ${link}`)]),
    `PDF source SHA-256: \`${source.sha256}\``,
    '',
    ...(selection.kind === 'text'
      ? ['Selected text:', selection.text]
      : [
        REGION_INSTRUCTION,
        ...(files.regionImage ? [`Region image: \`${files.regionImage}\``] : []),
        ...(selection.text ? ['', 'Text in the region:', selection.text] : []),
      ]),
  ].join('\n');
}

/** Escape the characters that would end or format a Markdown link label. */
function escapeLinkLabel(label: string): string {
  return label.replace(/[\\[\]`*_{}<>&|~]/gu, '\\$&');
}
