/**
 * Map EmbedPDF annotation geometry into the existing PdfSelection / agent
 * handoff shape (region + optional quote). Pure: no DOM or EmbedPDF runtime.
 */
import type { PageRect } from "./geometry";
import type { RegionSelection } from "./selection";

/** EmbedPDF rect: origin at page top-left, size in PDF points. */
export interface AnnotationRect {
  origin: { x: number; y: number };
  size: { width: number; height: number };
}

export interface AnnotationSelectionInput {
  /** 0-based PDF page index from EmbedPDF. */
  pageIndex: number;
  rect: AnnotationRect;
  /** Prefer page text in the mark's box; else annotation contents. */
  text?: string;
}

/** Region selection for AgentHandoff / agentText (1-based page). */
export function selectionFromAnnotation(
  input: AnnotationSelectionInput,
): RegionSelection {
  const { origin, size } = input.rect;
  const rect: PageRect = [
    origin.x,
    origin.y,
    origin.x + size.width,
    origin.y + size.height,
  ];
  const text = input.text?.trim();
  return {
    kind: "region",
    page: input.pageIndex + 1,
    rect,
    ...(text ? { text } : {}),
  };
}

/** Quote preference: underlying page text, else annotation contents. */
export function annotationQuoteText(options: {
  pageText?: string;
  contents?: string;
}): string | undefined {
  const page = options.pageText?.trim();
  if (page) {
    return page;
  }
  const contents = options.contents?.trim();
  return contents || undefined;
}

export interface AnnotationDeleteRef {
  object: { pageIndex: number; id: string };
}

/** Targets for EmbedPDF `deleteAnnotations`. */
export function annotationDeleteTargets(
  selected: readonly AnnotationDeleteRef[],
): Array<{ pageIndex: number; id: string }> {
  return selected.map(({ object }) => ({
    pageIndex: object.pageIndex,
    id: object.id,
  }));
}
