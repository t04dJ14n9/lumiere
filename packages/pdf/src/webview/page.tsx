import type { PdfDocumentObject } from "@embedpdf/models";
import { PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react";
import { SearchLayer } from "@embedpdf/plugin-search/react";
import { SelectionLayer } from "@embedpdf/plugin-selection/react";
import React from "react";
import type { PageRect } from "../shared/geometry";
import type { RegionSelection } from "../shared/selection";
import type { Highlight } from "./navigation";
import { PageLinks } from "./page-links";
import { DOCUMENT_ID } from "./plugins";
import { PageImage } from "./page-bitmaps";
import { renderPixelRatio } from "./render-resolution";

export interface PageProps {
  pdf: PdfDocumentObject;
  pageIndex: number;
  /** Size on screen, in CSS pixels. */
  width: number;
  height: number;
  devicePixelRatio: number;
  highlight: Highlight | undefined;
  region: RegionSelection | undefined;
  /** Open a page, from `top` points below its top when given. */
  onOpenPage: (page: number, top?: number) => void;
}

/**
 * One page, as layers from bottom to top: the rendered image, search hits,
 * clickable links, a highlighted location, the selected region, and
 * EmbedPDF's text selection (which also draws the region being dragged).
 */
export function Page({
  pdf,
  pageIndex,
  width,
  height,
  devicePixelRatio,
  highlight,
  region,
  onOpenPage,
}: PageProps): React.JSX.Element {
  const page = pageIndex + 1;
  const scale = width / Math.max(1, pdf.pages[pageIndex]?.size.width ?? width);
  const rotation = pageRotation(pdf, pageIndex);
  const layer = { pageIndex, scale };
  const layers = (
    <PagePointerProvider
      documentId={DOCUMENT_ID}
      {...layer}
      {...(rotation === 0
        ? {
            className: "page",
            "data-page-index": pageIndex,
            "data-scale": scale,
          }
        : {})}
      style={{ width, height }}
    >
      <PageImage
        {...layer}
        dpr={renderPixelRatio(scale, devicePixelRatio, width, height)}
      />
      <SearchLayer documentId={DOCUMENT_ID} {...layer} />
      <PageLinks pdf={pdf} {...layer} onOpenPage={onOpenPage} />
      <PageMarks
        page={page}
        scale={scale}
        highlight={highlight}
        region={region}
      />
      <TextSelection {...layer} />
    </PagePointerProvider>
  );
  return rotation === 0 ? (
    layers
  ) : (
    <RotatedPage
      pageIndex={pageIndex}
      scale={scale}
      size={{ width, height }}
      rotation={rotation}
    >
      {layers}
    </RotatedPage>
  );
}

/** A page's marks: a location's flashed box, and the selected region. */
function PageMarks({
  page,
  scale,
  highlight,
  region,
}: {
  page: number;
  scale: number;
  highlight: PageProps["highlight"];
  region: PageProps["region"];
}): React.JSX.Element {
  return (
    <>
      {highlight?.page === page && (
        <Box
          key={highlight.key}
          className="location-highlight"
          rect={highlight.rect}
          scale={scale}
        />
      )}
      {region?.page === page && (
        <Box className="region-selection" rect={region.rect} scale={scale} />
      )}
    </>
  );
}

/** EmbedPDF's text selection, which also draws the region being dragged. */
function TextSelection({
  pageIndex,
  scale,
}: {
  pageIndex: number;
  scale: number;
}): React.JSX.Element {
  return (
    <SelectionLayer
      documentId={DOCUMENT_ID}
      pageIndex={pageIndex}
      scale={scale}
      textStyle={{ background: "var(--selection-fill)" }}
      marqueeStyle={{
        background: "var(--selection-soft)",
        borderColor: "var(--selection-edge)",
        borderStyle: "solid",
      }}
      marqueeClassName="region-marquee"
    />
  );
}

/**
 * The page's own /Rotate: PDFium draws it, and every position EmbedPDF
 * reports (text, search hits, links), unrotated; the layers are turned as one.
 */
function RotatedPage({
  pageIndex,
  scale,
  size: { width, height },
  rotation,
  children,
}: {
  pageIndex: number;
  scale: number;
  size: { width: number; height: number };
  rotation: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const [boxWidth, boxHeight] =
    rotation % 2 === 1 ? [height, width] : [width, height];
  return (
    <div
      className="page"
      data-page-index={pageIndex}
      data-scale={scale}
      style={{ width: boxWidth, height: boxHeight }}
    >
      <div
        className="page-rotor"
        style={{
          width,
          height,
          transform: ROTOR[rotation]?.(boxWidth, boxHeight),
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** The page's /Rotate in quarter turns clockwise (0 to 3). */
function pageRotation(pdf: PdfDocumentObject, pageIndex: number): number {
  const turns = pdf.pages[pageIndex]?.rotation ?? 0;
  return Number.isInteger(turns) ? ((turns % 4) + 4) % 4 : 0;
}

/** Turn an unrotated page about its corner so it fills the rotated box. */
const ROTOR: Record<number, (boxWidth: number, boxHeight: number) => string> = {
  1: (boxWidth) => `translateX(${boxWidth}px) rotate(90deg)`,
  2: (boxWidth, boxHeight) =>
    `translate(${boxWidth}px, ${boxHeight}px) rotate(180deg)`,
  3: (_, boxHeight) => `translateY(${boxHeight}px) rotate(270deg)`,
};

function Box({
  rect,
  scale,
  className,
}: {
  rect: PageRect;
  scale: number;
  className: string;
}): React.JSX.Element {
  const [left, top, right, bottom] = rect;
  return (
    <div
      className={className}
      style={{
        left: left * scale,
        top: top * scale,
        width: (right - left) * scale,
        height: (bottom - top) * scale,
      }}
    />
  );
}
