import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { useRegistry } from "@embedpdf/core/react";
import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models";
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
    const refresh = (): void => setSelected(scope.getSelectedAnnotations());
    refresh();
    return scope.onStateChange(() => refresh());
  }, [annots, documentId, annotate]);

  useEffect(() => {
    if (!annotate || selected.length === 0) {
      clearAnnotationReport(reported, detailsToken);
      return;
    }
    reportAnnotationSelection({
      primary: selected[0]!,
      pdf,
      engine: registry?.getEngine(),
      reported,
      detailsToken,
    });
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

function clearAnnotationReport(
  reported: { current: RegionSelection | undefined },
  detailsToken: { current: number },
): void {
  detailsToken.current += 1;
  if (!reported.current) {
    return;
  }
  reported.current = undefined;
  reportToHost({ selection: { selection: null } });
}

function reportAnnotationSelection(args: {
  primary: TrackedAnnotation;
  pdf: PdfDocumentObject;
  engine: PdfEngine | undefined;
  reported: { current: RegionSelection | undefined };
  detailsToken: { current: number };
}): void {
  const { primary, pdf, engine, reported, detailsToken } = args;
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
  if (!engine) {
    return;
  }
  const token = ++detailsToken.current;
  void readRegionDetails(
    engine,
    pdf,
    primary.object.pageIndex + 1,
    immediate.rect,
  ).then(
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
}
