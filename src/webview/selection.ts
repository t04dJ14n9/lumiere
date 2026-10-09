import { useRegistry } from '@embedpdf/core/react';
import type { PdfDocumentObject, Rect } from '@embedpdf/models';
import type { SelectionScope } from '@embedpdf/plugin-selection';
import { useSelectionCapability } from '@embedpdf/plugin-selection/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageRect } from '../shared/geometry';
import type { RegionSelection } from '../shared/selection';
import { postToHost } from './host';
import { readRegionDetails } from './region-details';

/** Drags smaller than this (in points) are clicks, not regions. */
const MIN_REGION_SIZE = 2;

/**
 * Keep the extension informed of what is selected: text, selected with
 * EmbedPDF's text selection, or a region dragged over empty page space.
 * A region is reported at once, then again with the text inside it and a
 * PNG snapshot once they are read. Copy Link for Agent then hands over whatever was
 * reported last, waiting for a region's details if they are still coming.
 */
export function useSelectionReporting(documentId: string, pdf: PdfDocumentObject) {
  const { provides: selection } = useSelectionCapability();
  const { registry } = useRegistry();
  /** The region's details being read, if any. */
  const regionDetails = useRef<Promise<void> | undefined>(undefined);
  const [region, setRegion] = useState<RegionSelection>();
  const regionRef = useRef<RegionSelection | undefined>(undefined);
  /** The selected text, for Cmd/Ctrl+C. */
  const selectedText = useRef<string | undefined>(undefined);

  const changeRegion = useCallback((next: RegionSelection | undefined): void => {
    regionRef.current = next;
    setRegion(next);
    postToHost({ type: 'selection', selection: next ?? null });
  }, []);

  useEffect(() => {
    if (!selection) return;
    const scope = selection.forDocument(documentId);
    const unsubscribe = [
      scope.onEndSelection(() => {
        if (!scope.getState().selection) return;
        regionRef.current = undefined;
        setRegion(undefined);
        void reportText(scope).then(text => {
          selectedText.current = text;
        });
      }),
      scope.onSelectionChange(range => {
        if (range) return;
        selectedText.current = undefined;
        if (!regionRef.current) postToHost({ type: 'selection', selection: null });
      }),
      scope.onMarqueeEnd(({ pageIndex, rect }) => {
        if (rect.size.width < MIN_REGION_SIZE || rect.size.height < MIN_REGION_SIZE) return;
        const region: RegionSelection = { kind: 'region', page: pageIndex + 1, rect: toPageRect(rect) };
        changeRegion(region);
        const engine = registry?.getEngine();
        if (!engine) return;
        regionDetails.current = readRegionDetails(engine, pdf, region.page, region.rect).then(({ text, image }) => {
          // Dropped if another region or a text selection replaced this one.
          if (regionRef.current !== region) return;
          const detailed: RegionSelection = { ...region, ...(text ? { text } : {}) };
          regionRef.current = detailed;
          setRegion(detailed);
          postToHost({ type: 'selection', selection: detailed, ...(image ? { image } : {}) });
        }, () => undefined);
      }),
      scope.onEmptySpaceClick(() => {
        if (regionRef.current) changeRegion(undefined);
      }),
    ];
    return () => unsubscribe.forEach(stop => stop());
  }, [changeRegion, documentId, pdf, registry, selection]);

  /**
   * Ask the extension to copy the selection. A text selection is reported
   * when the drag ends, after an asynchronous text read; a click right after
   * the drag could beat that report, so the text is re-read and reported
   * first. A region waits for its text and snapshot. Messages arrive in order.
   */
  const reportSelection = useCallback(async (): Promise<void> => {
    const scope = selection?.forDocument(documentId);
    if (scope?.getState().selection) await reportText(scope);
    else if (regionRef.current) await regionDetails.current;
  }, [documentId, selection]);

  const copyLinkForAgent = useCallback(async (): Promise<void> => {
    await reportSelection();
    postToHost({ type: 'copyLinkForAgent' });
  }, [reportSelection]);

  const copyText = useCallback((): void => {
    selection?.forDocument(documentId).copyToClipboard();
  }, [documentId, selection]);

  // The text selection is drawn by EmbedPDF, not the browser, so answer the
  // copy command (Cmd/Ctrl+C) with the selected text ourselves.
  useEffect(() => {
    const onCopy = (event: ClipboardEvent): void => {
      const text = selectedText.current;
      if (!text || !event.clipboardData || isEditable(event.target)) return;
      event.clipboardData.setData('text/plain', text);
      event.preventDefault();
    };
    document.addEventListener('copy', onCopy);
    return () => document.removeEventListener('copy', onCopy);
  }, []);

  /** Clear whatever is selected, text or region (Escape). */
  const clear = useCallback((): void => {
    if (regionRef.current) changeRegion(undefined);
    // Reported to the extension by the selection change handler above.
    selection?.forDocument(documentId).clear();
  }, [changeRegion, documentId, selection]);

  return { region, clear, copyLinkForAgent, copyText };
}

export type SelectionReporting = ReturnType<typeof useSelectionReporting>;

/** Read the selected text and its line boxes, report them, and return the text. */
function reportText(scope: SelectionScope): Promise<string | undefined> {
  return new Promise(resolve => {
    scope.getSelectedText().wait(lines => {
      const text = lines.join(' ').replace(/\s+/gu, ' ').trim();
      const pages = scope.getFormattedSelection().map(page => ({
        page: page.pageIndex + 1,
        rects: page.segmentRects.map(toPageRect),
      }));
      if (text && pages.length > 0) postToHost({ type: 'selection', selection: { kind: 'text', text, pages } });
      resolve(text || undefined);
    }, () => resolve(undefined));
  });
}

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]') !== null;
}

function toPageRect(rect: Rect): PageRect {
  return [rect.origin.x, rect.origin.y, rect.origin.x + rect.size.width, rect.origin.y + rect.size.height];
}
