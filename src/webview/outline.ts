import type { PdfDocumentObject } from '@embedpdf/models';
import { useBookmarkCapability } from '@embedpdf/plugin-bookmark/react';
import { useEffect } from 'react';
import { reportToHost } from './host';
import { toOutline } from './pdf-targets';

/** Read the PDF's bookmarks once and send them to the extension's outline view. */
export function useOutlinePublishing(documentId: string, pdf: PdfDocumentObject): void {
  const { provides: bookmarks } = useBookmarkCapability();
  useEffect(() => {
    if (!bookmarks) return;
    const task = bookmarks.forDocument(documentId).getBookmarks();
    task.wait(
      result => reportToHost({ outline: toOutline(result.bookmarks, pdf) }),
      () => reportToHost({ outline: [] }),
    );
    return () => task.abort({ code: 1, message: 'The viewer closed' });
  }, [bookmarks, documentId, pdf]);
}
