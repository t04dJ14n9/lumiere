import { useRegistry } from "@embedpdf/core/react";
import type { PdfDocumentObject, Rect } from "@embedpdf/models";
import type { SelectionScope } from "@embedpdf/plugin-selection";
import { useSelectionCapability } from "@embedpdf/plugin-selection/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PageRect } from "../shared/geometry";
import type { RegionSelection } from "../shared/selection";
import { postToHost, reportToHost } from "./host";
import { followMenuContext } from "./menu-context";
import { readRegionDetails } from "./region-details";

/** Drags smaller than this (in points) are clicks, not regions. */
const MIN_REGION_SIZE = 2;

/**
 * Keep the extension informed of what is selected: text, selected with
 * EmbedPDF's text selection, or a region dragged over empty page space.
 * A region is reported at once, then again with the text inside it and a
 * PNG snapshot once they are read. Copy Link for Agent then hands over whatever was
 * reported last, waiting for a region's details if they are still coming.
 */
export function useSelectionReporting(
  documentId: string,
  pdf: PdfDocumentObject,
) {
  const { provides: selection } = useSelectionCapability();
  const { registry } = useRegistry();
  const [region, setRegion] = useState<RegionSelection>();
  const tracker = useRef<SelectionTracker | undefined>(undefined);
  tracker.current ??= new SelectionTracker(setRegion);
  const state = tracker.current;
  useEffect(() => {
    if (!selection) {
      return;
    }
    const engine = () => registry?.getEngine();
    return state.follow(selection.forDocument(documentId), { engine, pdf });
  }, [state, documentId, pdf, registry, selection]);
  useCopiedText(state);
  useEffect(
    () =>
      followMenuContext(
        document,
        () =>
          Boolean(state.region) ||
          Boolean(selection?.forDocument(documentId).getState().selection),
      ),
    [state, documentId, selection],
  );
  /** Report the selection now: the extension asks before Copy Link for Agent. */
  const reportNow = useCallback((): void => {
    void state.reportSelection(selection?.forDocument(documentId));
  }, [state, documentId, selection]);
  const copyLinkForAgent = useCallback(async (): Promise<void> => {
    await state.reportSelection(selection?.forDocument(documentId));
    postToHost({ type: "copyLinkForAgent" });
  }, [state, documentId, selection]);
  /** Clear whatever is selected, text or region (Escape). */
  const clear = useCallback((): void => {
    if (state.region) {
      state.changeRegion(undefined);
    }
    // Reported to the extension by the selection change handler.
    selection?.forDocument(documentId).clear();
  }, [state, documentId, selection]);
  return { region, clear, copyLinkForAgent, reportNow };
}

type Engine = Parameters<typeof readRegionDetails>[0];

/** What is selected, as last reported to the extension. */
class SelectionTracker {
  region: RegionSelection | undefined;
  /** The selected text, for Cmd/Ctrl+C. */
  selectedText: string | undefined;
  /** The region's details being read, if any. */
  private regionDetails: Promise<void> | undefined;

  constructor(
    private readonly setRegion: (region: RegionSelection | undefined) => void,
  ) {}

  changeRegion(next: RegionSelection | undefined): void {
    this.region = next;
    this.setRegion(next);
    reportToHost({ selection: { selection: next ?? null } });
  }

  /** Follow EmbedPDF's selection events; returns how to stop. */
  follow(
    scope: SelectionScope,
    source: { engine: () => Engine | undefined; pdf: PdfDocumentObject },
  ): () => void {
    /** Whether the marquee that just ended drew a region (else it was a click). */
    let marqueeEnded = false;
    const stops = [
      scope.onEndSelection(() => this.textSelected(scope)),
      scope.onSelectionChange((range) => {
        if (!range) {
          this.textCleared();
        }
      }),
      // A click with the Select Region tool, which has no empty-space clicks:
      // the marquee is cancelled without ending.
      scope.onMarqueeChange(({ rect }) => {
        if (rect) {
          return;
        }
        if (marqueeEnded) {
          marqueeEnded = false;
        } else if (this.region) {
          this.changeRegion(undefined);
        }
      }),
      scope.onMarqueeEnd((event) => {
        marqueeEnded = true;
        this.regionDrawn(event, source);
      }),
      scope.onEmptySpaceClick(() => {
        if (this.region) {
          this.changeRegion(undefined);
        }
      }),
    ];
    return () => stops.forEach((stop) => stop());
  }

  /**
   * Make sure the extension has the selection before Copy Link for Agent. A
   * text selection is reported when the drag ends, after an asynchronous text
   * read; a click right after the drag could beat that report, so the text is
   * re-read and reported first. A region waits for its text and snapshot.
   * Messages arrive in order.
   */
  async reportSelection(scope: SelectionScope | undefined): Promise<void> {
    if (scope?.getState().selection) {
      await reportText(scope);
    } else if (this.region) {
      await this.regionDetails;
    }
  }

  private textSelected(scope: SelectionScope): void {
    if (!scope.getState().selection) {
      return;
    }
    this.region = undefined;
    this.setRegion(undefined);
    void reportText(scope).then((text) => {
      this.selectedText = text;
    });
  }

  private textCleared(): void {
    this.selectedText = undefined;
    if (!this.region) {
      reportToHost({ selection: { selection: null } });
    }
  }

  private regionDrawn(
    { pageIndex, rect }: { pageIndex: number; rect: Rect },
    source: { engine: () => Engine | undefined; pdf: PdfDocumentObject },
  ): void {
    if (
      rect.size.width < MIN_REGION_SIZE ||
      rect.size.height < MIN_REGION_SIZE
    ) {
      return;
    }
    const region: RegionSelection = {
      kind: "region",
      page: pageIndex + 1,
      rect: toPageRect(rect),
    };
    this.changeRegion(region);
    const engine = source.engine();
    if (engine) {
      this.regionDetails = this.readDetails(engine, source.pdf, region);
    }
  }

  /** Report the region again with its text and snapshot, unless replaced meanwhile. */
  private readDetails(
    engine: Engine,
    pdf: PdfDocumentObject,
    region: RegionSelection,
  ): Promise<void> {
    return readRegionDetails(engine, pdf, region.page, region.rect).then(
      ({ text, image }) => {
        if (this.region !== region) {
          return;
        }
        const detailed: RegionSelection = {
          ...region,
          ...(text ? { text } : {}),
        };
        this.region = detailed;
        this.setRegion(detailed);
        reportToHost({
          selection: { selection: detailed, ...(image ? { image } : {}) },
        });
      },
      () => undefined,
    );
  }
}

/**
 * The text selection is drawn by EmbedPDF, not the browser, so answer the
 * copy command (Cmd/Ctrl+C) with the selected text ourselves.
 */
function useCopiedText(state: SelectionTracker): void {
  useEffect(() => {
    const onCopy = (event: ClipboardEvent): void => {
      const text = state.selectedText;
      if (!text || !event.clipboardData || isEditable(event.target)) {
        return;
      }
      event.clipboardData.setData("text/plain", text);
      event.preventDefault();
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [state]);
}

export type SelectionReporting = ReturnType<typeof useSelectionReporting>;

/** Read the selected text and its line boxes, report them, and return the text. */
function reportText(scope: SelectionScope): Promise<string | undefined> {
  return new Promise((resolve) => {
    scope.getSelectedText().wait(
      (lines) => {
        const text = lines.join(" ").replace(/\s+/gu, " ").trim();
        const pages = scope.getFormattedSelection().map((page) => ({
          page: page.pageIndex + 1,
          rects: page.segmentRects.map(toPageRect),
        }));
        if (text && pages.length > 0) {
          reportToHost({
            selection: { selection: { kind: "text", text, pages } },
          });
        }
        resolve(text || undefined);
      },
      () => resolve(undefined),
    );
  });
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('input, textarea, [contenteditable="true"]') !== null
  );
}

function toPageRect(rect: Rect): PageRect {
  return [
    rect.origin.x,
    rect.origin.y,
    rect.origin.x + rect.size.width,
    rect.origin.y + rect.size.height,
  ];
}
