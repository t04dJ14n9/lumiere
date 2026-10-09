import type { Rect } from '@embedpdf/models';
import type { SelectionScope } from '@embedpdf/plugin-selection';
import { useSelectionCapability } from '@embedpdf/plugin-selection/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageRect } from '../shared/geometry';
import type { RegionSelection } from '../shared/selection';
import { postToHost } from './host';

/** Drags smaller than this (in points) are clicks, not regions. */
const MIN_REGION_SIZE = 2;

/**
 * Keep the extension informed of what is selected: text, selected with
 * EmbedPDF's text selection, or a region dragged over empty page space.
 * Copy for Agent then copies whatever was reported last.
 */
export function useSelectionReporting(documentId: string) {
  const { provides: selection } = useSelectionCapability();
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
        changeRegion({ kind: 'region', page: pageIndex + 1, rect: toPageRect(rect) });
      }),
      scope.onEmptySpaceClick(() => {
        if (regionRef.current) changeRegion(undefined);
      }),
    ];
    return () => unsubscribe.forEach(stop => stop());
  }, [changeRegion, documentId, selection]);

  /**
   * Ask the extension to copy the selection. A text selection is reported
   * when the drag ends, after an asynchronous text read; a click right after
   * the drag could beat that report, so the text is re-read and reported
   * first. Messages arrive in order.
   */
  const copyForAgent = useCallback(async (): Promise<void> => {
    const scope = selection?.forDocument(documentId);
    if (scope?.getState().selection) await reportText(scope);
    postToHost({ type: 'copyForAgent' });
  }, [documentId, selection]);

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

  return { region, clear, copyForAgent, copyText };
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
