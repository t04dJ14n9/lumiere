import { PdfActionType, type PdfBookmarkObject, type PdfLinkTarget } from '@embedpdf/models';
import type { OutlineItem } from '../shared/messages';

/**
 * The 1-based page a bookmark or link opens, if it points inside the PDF.
 * External links (URLs, other files) have none.
 */
export function targetPage(target: PdfLinkTarget | undefined): number | undefined {
  if (!target) return undefined;
  const destination = target.type === 'destination'
    ? target.destination
    : target.action.type === PdfActionType.Goto ? target.action.destination : undefined;
  return destination ? destination.pageIndex + 1 : undefined;
}

/** The web address a link opens, if it is a URI action. */
export function targetUrl(target: PdfLinkTarget | undefined): string | undefined {
  return target?.type === 'action' && target.action.type === PdfActionType.URI ? target.action.uri : undefined;
}

/** The PDF's bookmarks as the outline shown in VS Code. */
export function toOutline(bookmarks: readonly PdfBookmarkObject[]): OutlineItem[] {
  return bookmarks.map(bookmark => {
    const page = targetPage(bookmark.target);
    return {
      title: bookmark.title,
      ...(page ? { page } : {}),
      children: toOutline(bookmark.children ?? []),
    };
  });
}
