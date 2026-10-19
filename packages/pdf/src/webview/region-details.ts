import type {
  PdfDocumentObject,
  PdfEngine,
  PdfPageObject,
  PdfTask,
  Rect,
} from "@embedpdf/models";
import type { PageRect } from "../shared/geometry";
import { regionRuns, regionText, type CharBox } from "../shared/region-text";

/** Render regions at twice the page's point size (144 dpi) for legible text… */
const SNAPSHOT_SCALE = 2;
/** …but no larger than this on either side, so the image stays small. */
const MAX_SNAPSHOT_SIDE = 2000;

export interface RegionDetails {
  /** The text inside the region, line by line; empty for a figure. */
  text: string;
  /** A PNG of the region as a data URL, if it could be rendered. */
  image?: string;
}

/**
 * What an agent needs to see a dragged region: the text inside it, read
 * character by character, and a PNG snapshot of it for figures and tables.
 */
export async function readRegionDetails(
  engine: PdfEngine,
  pdf: PdfDocumentObject,
  pageNumber: number,
  rect: PageRect,
): Promise<RegionDetails> {
  const page = pdf.pages[pageNumber - 1];
  if (!page) {
    return { text: "" };
  }
  const [text, image] = await Promise.all([
    readText(engine, pdf, page, rect),
    settle(
      engine.renderPageRect(pdf, page, toRect(rect), {
        scaleFactor: Math.min(
          SNAPSHOT_SCALE,
          MAX_SNAPSHOT_SIDE / Math.max(rect[2] - rect[0], rect[3] - rect[1]),
        ),
        dpr: 1,
        imageType: "image/png",
        withAnnotations: true,
      }),
    ),
  ]);
  return { text, ...(image ? { image: await dataUrl(image) } : {}) };
}

/**
 * Read the characters inside the region. (Not with the engine's
 * getPageTextRects: its text can end in stray characters.)
 */
async function readText(
  engine: PdfEngine,
  pdf: PdfDocumentObject,
  page: PdfPageObject,
  rect: PageRect,
): Promise<string> {
  const glyphs = await settle(engine.getPageGlyphs(pdf, page));
  if (!glyphs) {
    return "";
  }
  // The glyph list has holes where PDFium added characters; keep them, and
  // treat spaces alike: their boxes are empty. Tight boxes, around the
  // glyph's shape: loose ones overlap the next table row.
  const boxes: CharBox[] = Array.from(glyphs, (glyph) => {
    if (!glyph || glyph.isSpace) {
      return undefined;
    }
    const { x, y } = glyph.tightOrigin ?? glyph.origin;
    const { width, height } = glyph.tightSize ?? glyph.size;
    return width > 0 && height > 0 ? [x, y, x + width, y + height] : undefined;
  });
  const runs = regionRuns(boxes, rect);
  if (runs.length === 0) {
    return "";
  }
  const texts = await settle(
    engine.getTextSlices(
      pdf,
      runs.map(({ charIndex, charCount }) => ({
        pageIndex: page.index,
        charIndex,
        charCount,
      })),
    ),
  );
  return texts
    ? regionText(
        runs.map((run, index) => ({
          content: texts[index] ?? "",
          rect: run.rect,
        })),
        rect,
      )
    : "";
}

function settle<T>(task: PdfTask<T>): Promise<T | undefined> {
  return task.toPromise().catch(() => undefined);
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read the region snapshot."));
    reader.readAsDataURL(blob);
  });
}

function toRect([left, top, right, bottom]: PageRect): Rect {
  return {
    origin: { x: left, y: top },
    size: { width: right - left, height: bottom - top },
  };
}
