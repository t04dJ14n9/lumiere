/**
 * Locations inside a PDF and the link format that carries them.
 *
 * A location is written as a URL fragment using the `page` and `viewrect`
 * parameters of RFC 8118 (the `application/pdf` media type), for example
 *
 *     paper.pdf#page=3&viewrect=72,83,134,21
 *
 * Agents can read such a link without tools, and the extension can open it.
 */
import type { ViewRect } from './geometry';

export interface PdfLocation {
  /** 1-based page number. */
  page: number;
  /** A box on that page, in points from its top-left corner. */
  viewRect?: ViewRect;
}

/** `page=3&viewrect=72,83,134,21`, rounded to a tenth of a point. */
export function formatLocationFragment(location: PdfLocation): string {
  const parts = [`page=${location.page}`];
  if (location.viewRect) {
    const { left, top, width, height } = location.viewRect;
    parts.push(`viewrect=${[left, top, width, height].map(roundToTenth).join(',')}`);
  }
  return parts.join('&');
}

/**
 * Read a location from a link fragment. Unknown parameters are ignored; an
 * invalid page makes the whole fragment invalid, an invalid box is dropped.
 */
export function parseLocationFragment(fragment: string): PdfLocation | undefined {
  const parameters = new Map<string, string>();
  for (const part of fragment.replace(/^#/, '').split('&')) {
    const separator = part.indexOf('=');
    if (separator > 0) {
      parameters.set(part.slice(0, separator).toLowerCase(), decodeURIComponent(part.slice(separator + 1)));
    }
  }
  const page = Number(parameters.get('page'));
  if (!Number.isSafeInteger(page) || page < 1) return undefined;
  const viewRect = parseViewRect(parameters.get('viewrect'));
  return viewRect ? { page, viewRect } : { page };
}

/** A link to `location` in the PDF at `path` (a path or URL, used as given). */
export function pdfLink(path: string, location: PdfLocation): string {
  return `${path}#${formatLocationFragment(location)}`;
}

/**
 * The link in text a reader pasted: a bare link or path, `<link>`, or a
 * Markdown link `[label](<link>)` such as the `Source:` line Copy Link for Agent
 * writes (the first link, if there are several).
 */
export function extractPdfLink(text: string): string {
  const markdown = /\]\(<([^>]+)>\)/.exec(text) ?? /\]\(([^)\s]+)\)/.exec(text);
  const link = markdown ? markdown[1]! : text.trim().replace(/^sources?:\s*/i, '');
  return link.trim().replace(/^<(.*)>$/, '$1');
}

function parseViewRect(value: string | undefined): ViewRect | undefined {
  if (!value) return undefined;
  const numbers = value.split(',').map(Number);
  if (numbers.length !== 4 || !numbers.every(Number.isFinite)) return undefined;
  const [left, top, width, height] = numbers as [number, number, number, number];
  if (left < 0 || top < 0 || width <= 0 || height <= 0) return undefined;
  return { left, top, width, height };
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
