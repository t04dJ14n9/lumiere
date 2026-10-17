import {
  gatherIdeContext,
  DEFAULT_CAPS,
  type IdeContextPacket,
  type IdeContextCaps,
  type IdeContextHostApis,
  type PdfSelectionWire,
  type PdfRect,
} from "../../../shared/ide-context";
import { selectedPages, type PdfSelection } from "../../../shared/selection";
import type { PageRect } from "../../../shared/geometry";

export interface PdfIdeContextInput {
  uri: string;
  selection: PdfSelection | null | undefined;
  page?: number;
  pageCount?: number;
  viewrect?: { x: number; y: number; w: number; h: number };
  sourceSha256?: string;
  citeMarkdown?: string;
  regionImagePath?: string;
  host: IdeContextHostApis;
  caps?: IdeContextCaps;
}

function toWireRect(page: number, rect: PageRect): PdfRect {
  const [left, top, right, bottom] = rect;
  return { page, x: left, y: top, w: right - left, h: bottom - top };
}

/** Map PDF viewer selection → wire pdf.selection (never into active.selection). */
export function mapPdfSelectionWire(
  selection: PdfSelection | null | undefined,
  regionImagePath?: string,
): PdfSelectionWire {
  if (!selection) {
    return { kind: "none" };
  }
  if (selection.kind === "text") {
    const rects = selectedPages(selection).flatMap((p) =>
      p.rects.map((r) => toWireRect(p.page, r)),
    );
    return {
      kind: "text",
      text: selection.text,
      truncated: false,
      ...(rects.length ? { rects, rectsTruncated: false } : {}),
    };
  }
  return {
    kind: "region",
    rects: [toWireRect(selection.page, selection.rect)],
    rectsTruncated: false,
    ...(regionImagePath ? { regionImagePath } : {}),
  };
}

export function buildPdfIdeContextPacket(
  input: PdfIdeContextInput,
): IdeContextPacket {
  const wire = mapPdfSelectionWire(input.selection, input.regionImagePath);
  return gatherIdeContext(
    input.host,
    {
      product: "pdfWorkshop",
      uri: input.uri,
      pdf: {
        uri: input.uri,
        selection: wire,
        ...(input.page !== undefined ? { page: input.page } : {}),
        ...(input.pageCount !== undefined
          ? { pageCount: input.pageCount }
          : {}),
        ...(input.viewrect ? { viewrect: input.viewrect } : {}),
        ...(input.sourceSha256 ? { sourceSha256: input.sourceSha256 } : {}),
        ...(input.citeMarkdown ? { citeMarkdown: input.citeMarkdown } : {}),
      },
    },
    input.caps ?? DEFAULT_CAPS,
  );
}
