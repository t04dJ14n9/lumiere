import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { useRegistry } from "@embedpdf/core/react";
import type { PdfDocumentObject } from "@embedpdf/models";
import type { TrackedAnnotation } from "@embedpdf/plugin-annotation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  annotationDeleteTargets,
  annotationQuoteText,
  selectionFromAnnotation,
} from "../shared/annotation-handoff";
import type { RegionSelection } from "../shared/selection";
import { reportToHost } from "./host";
import { readRegionDetails } from "./region-details";

/**
 * While Annotate mode is on, mirror EmbedPDF's selected annotations into the
 * host selection (region shape) so Copy Link for Agent reuses AgentHandoff,
 * and expose delete for the selected mark(s).
 */
export function useAnnotationSelection(
  documentId: string,
  pdf: PdfDocumentObject,
  annotate: boolean,
): {
  hasAnnotationSelection: boolean;
  deleteSelected: () => void;
} {
  const { provides: annots } = useAnnotationCapability();
  const { registry } = useRegistry();
  const [selected, setSelected] = useState<TrackedAnnotation[]>([]);
  const reported = useRef<RegionSelection | undefined>(undefined);
  const detailsToken = useRef(0);

  useEffect(() => {
    if (!annots || !annotate) {
      setSelected([]);
      return;
    }
    const scope = annots.forDocument(documentId);
    const refresh = (): void => {
      setSelected(scope.getSelectedAnnotations());
    };
    refresh();
    return scope.onStateChange(() => refresh());
  }, [annots, documentId, annotate]);

  useEffect(() => {
    if (!annotate) {
      if (reported.current) {
        reported.current = undefined;
        reportToHost({ selection: { selection: null } });
      }
      detailsToken.current += 1;
      return;
    }
    if (selected.length === 0) {
      if (reported.current) {
        reported.current = undefined;
        reportToHost({ selection: { selection: null } });
      }
      detailsToken.current += 1;
      return;
    }
    const primary = selected[0]!;
    const contents =
      typeof primary.object.contents === "string"
        ? primary.object.contents
        : undefined;
    const immediateQuote = annotationQuoteText(
      contents === undefined ? {} : { contents },
    );
    const immediate = selectionFromAnnotation({
      pageIndex: primary.object.pageIndex,
      rect: primary.object.rect,
      ...(immediateQuote ? { text: immediateQuote } : {}),
    });
    reported.current = immediate;
    reportToHost({ selection: { selection: immediate } });

    const token = ++detailsToken.current;
    const engine = registry?.getEngine();
    if (!engine) {
      return;
    }
    const page = primary.object.pageIndex + 1;
    const rect = immediate.rect;
    void readRegionDetails(engine, pdf, page, rect).then(
      ({ text }) => {
        if (token !== detailsToken.current || reported.current !== immediate) {
          return;
        }
        const quote = annotationQuoteText({
          pageText: text,
          ...(contents === undefined ? {} : { contents }),
        });
        const detailed = selectionFromAnnotation({
          pageIndex: primary.object.pageIndex,
          rect: primary.object.rect,
          ...(quote ? { text: quote } : {}),
        });
        reported.current = detailed;
        reportToHost({ selection: { selection: detailed } });
      },
      () => undefined,
    );
  }, [annotate, selected, pdf, registry]);

  const deleteSelected = useCallback((): void => {
    if (!annots || !annotate || selected.length === 0) {
      return;
    }
    annots
      .forDocument(documentId)
      .deleteAnnotations(annotationDeleteTargets(selected));
  }, [annots, annotate, documentId, selected]);

  return {
    hasAnnotationSelection: annotate && selected.length > 0,
    deleteSelected,
  };
}
