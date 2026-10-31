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

export type SetAnnotationRegion = (
  next: RegionSelection | undefined,
  enrich?: { engine: PdfEngine; pdf: PdfDocumentObject },
) => void;

/**
 * While Annotate mode is on, mirror EmbedPDF's selected annotations into the
 * host selection via SelectionTracker (same path as marquee regions) so Copy
 * Link for Agent / ensureSelection stay consistent, and expose delete.
 */
export function useAnnotationSelection(
  documentId: string,
  pdf: PdfDocumentObject,
  annotate: boolean,
  setAnnotationRegion: SetAnnotationRegion,
): {
  hasAnnotationSelection: boolean;
  deleteSelected: () => void;
} {
  const { provides: annots } = useAnnotationCapability();
  const { registry } = useRegistry();
  const [selected, setSelected] = useState<TrackedAnnotation[]>([]);
  const owned = useRef(false);
  const setRegion = useRef(setAnnotationRegion);
  setRegion.current = setAnnotationRegion;

  useEffect(() => {
    if (!annotate) {
      annots?.forDocument(documentId).deselectAnnotation();
      setSelected([]);
      return;
    }
    if (!annots) {
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
      clearOwnedAnnotationRegion(owned, setRegion.current);
      return;
    }
    applyAnnotationRegion({
      primary: selected[0]!,
      pdf,
      engine: registry?.getEngine(),
      owned,
      setAnnotationRegion: setRegion.current,
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

function clearOwnedAnnotationRegion(
  owned: { current: boolean },
  setAnnotationRegion: SetAnnotationRegion,
): void {
  if (!owned.current) {
    return;
  }
  owned.current = false;
  setAnnotationRegion(undefined);
}

function applyAnnotationRegion(args: {
  primary: TrackedAnnotation;
  pdf: PdfDocumentObject;
  engine: PdfEngine | undefined;
  owned: { current: boolean };
  setAnnotationRegion: SetAnnotationRegion;
}): void {
  const { primary, pdf, engine, owned, setAnnotationRegion } = args;
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
  owned.current = true;
  setAnnotationRegion(immediate, engine ? { engine, pdf } : undefined);
}
