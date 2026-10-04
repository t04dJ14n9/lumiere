import { useRegistry } from '@embedpdf/core/react';
import { PdfAnnotationSubtype, type PdfDocumentObject, type Rect } from '@embedpdf/models';
import React, { useEffect, useState } from 'react';
import { postToHost } from './host';
import { targetPage, targetUrl } from './pdf-targets';

interface Link {
  id: string;
  rect: Rect;
  /** An internal link opens a page; an external one a web address. */
  page?: number;
  url?: string;
}

/** Clickable links on a page: contents entries, citations, figure references, URLs. */
export function PageLinks({ pdf, pageIndex, scale, onOpenPage }: {
  pdf: PdfDocumentObject;
  pageIndex: number;
  scale: number;
  onOpenPage: (page: number) => void;
}): React.JSX.Element {
  const links = usePageLinks(pdf, pageIndex);
  return (
    <>
      {links.map(link => (
        <a
          key={link.id}
          className="page-link"
          href={link.url ?? `#page=${link.page}`}
          title={link.url ?? `Page ${link.page}`}
          aria-label={link.url ? `Open ${link.url}` : `Go to page ${link.page}`}
          style={{
            left: link.rect.origin.x * scale,
            top: link.rect.origin.y * scale,
            width: link.rect.size.width * scale,
            height: link.rect.size.height * scale,
          }}
          onClick={event => {
            event.preventDefault();
            if (link.page) onOpenPage(link.page);
            else if (link.url) postToHost({ type: 'openExternal', url: link.url });
          }}
        />
      ))}
    </>
  );
}

function usePageLinks(pdf: PdfDocumentObject, pageIndex: number): Link[] {
  const { registry } = useRegistry();
  const [links, setLinks] = useState<Link[]>([]);
  useEffect(() => {
    const page = pdf.pages[pageIndex];
    if (!registry || !page) return;
    const task = registry.getEngine().getPageAnnotations(pdf, page);
    task.wait(annotations => {
      setLinks(annotations.flatMap((annotation): Link[] => {
        if (annotation.type !== PdfAnnotationSubtype.LINK) return [];
        const target = { page: targetPage(annotation.target), url: targetUrl(annotation.target) };
        return target.page || target.url ? [{ id: annotation.id, rect: annotation.rect, ...target }] : [];
      }));
    }, () => setLinks([]));
    return () => task.abort({ code: 1, message: 'The page closed' });
  }, [pdf, pageIndex, registry]);
  return links;
}
