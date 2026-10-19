import {
  PdfActionType,
  PdfZoomMode,
  type PdfBookmarkObject,
  type PdfDestinationObject,
  type PdfDocumentObject,
  type PdfLinkTarget,
} from "@embedpdf/models";
import type { OutlineItem } from "../shared/messages";

/**
 * The 1-based page a bookmark or link opens, if it points inside the PDF.
 * External links (URLs, other files) have none.
 */
export function targetPage(
  target: PdfLinkTarget | undefined,
): number | undefined {
  const destination = targetDestination(target);
  return destination ? destination.pageIndex + 1 : undefined;
}

/**
 * How far down its page a bookmark or link opens, in points from the top,
 * for destinations that name a height (a heading or reference halfway down
 * a page). Undefined means the top of the page.
 *
 * PDF destinations measure up from the bottom of the page.
 */
export function targetTop(
  target: PdfLinkTarget | undefined,
  pdf: PdfDocumentObject,
): number | undefined {
  const destination = targetDestination(target);
  const height = destination && pdf.pages[destination.pageIndex]?.size.height;
  if (!destination || !height) {
    return undefined;
  }
  const fromBottom = destinationHeight(destination);
  if (fromBottom === undefined) {
    return undefined;
  }
  const top = height - Math.min(height, fromBottom);
  return top >= 0 ? top : undefined;
}

function targetDestination(
  target: PdfLinkTarget | undefined,
): PdfDestinationObject | undefined {
  if (!target) {
    return undefined;
  }
  if (target.type === "destination") {
    return target.destination;
  }
  return target.action.type === PdfActionType.Goto
    ? target.action.destination
    : undefined;
}

/** The height a destination names, in PDF points up from the page bottom. */
function destinationHeight(
  destination: PdfDestinationObject,
): number | undefined {
  switch (destination.zoom.mode) {
    case PdfZoomMode.XYZ:
      // PDFium reports 0 when the destination leaves the height unset.
      return destination.zoom.params.y > 0
        ? destination.zoom.params.y
        : undefined;
    case PdfZoomMode.FitHorizontal:
    case PdfZoomMode.FitBoundingBoxHorizontal:
      return destination.view[0];
    default:
      return undefined;
  }
}

/** The web address a link opens, if it is a URI action. */
export function targetUrl(
  target: PdfLinkTarget | undefined,
): string | undefined {
  return target?.type === "action" && target.action.type === PdfActionType.URI
    ? target.action.uri
    : undefined;
}

/** The PDF's bookmarks as the outline shown in VS Code. */
export function toOutline(
  bookmarks: readonly PdfBookmarkObject[],
  pdf: PdfDocumentObject,
): OutlineItem[] {
  return bookmarks.map((bookmark) => {
    const page = targetPage(bookmark.target);
    const top = page ? targetTop(bookmark.target, pdf) : undefined;
    return {
      title: bookmark.title,
      ...(page ? { page } : {}),
      ...(top !== undefined ? { top } : {}),
      children: toOutline(bookmark.children ?? [], pdf),
    };
  });
}
