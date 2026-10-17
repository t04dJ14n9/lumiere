import type { PdfDocumentObject } from "@embedpdf/models";
import { PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react";
import { SearchLayer } from "@embedpdf/plugin-search/react";
import {
  SelectionLayer,
  type SelectionSelectionMenuProps,
} from "@embedpdf/plugin-selection/react";
import React, { useLayoutEffect, useRef, useState } from "react";
import type { PageRect } from "../shared/geometry";
import type { RegionSelection } from "../shared/selection";
import type { Highlight } from "./navigation";
import { PageLinks } from "./page-links";
import { DOCUMENT_ID } from "./plugins";
import { PageImage } from "./page-bitmaps";
import { renderPixelRatio } from "./render-resolution";
import type { SelectionReporting } from "./selection";

export interface PageProps {
  pdf: PdfDocumentObject;
  pageIndex: number;
  /** Size on screen, in CSS pixels. */
  width: number;
  height: number;
  devicePixelRatio: number;
  highlight: Highlight | undefined;
  region: RegionSelection | undefined;
  selection: SelectionReporting;
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
  selection,
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
        selection={selection}
      />
      <TextSelection {...layer} selection={selection} />
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

/** A page's marks: a location's flashed box, and the selected region with its menu. */
function PageMarks({
  page,
  scale,
  highlight,
  region,
  selection,
}: {
  page: number;
  scale: number;
  highlight: PageProps["highlight"];
  region: PageProps["region"];
  selection: PageProps["selection"];
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
        <>
          <Box className="region-selection" rect={region.rect} scale={scale} />
          <RegionMenu rect={region.rect} scale={scale} selection={selection} />
        </>
      )}
    </>
  );
}

/** EmbedPDF's text selection, which also draws the region being dragged. */
function TextSelection({
  pageIndex,
  scale,
  selection,
}: {
  pageIndex: number;
  scale: number;
  selection: SelectionReporting;
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
      selectionMenu={(props) => (
        <TextSelectionMenu {...props} selection={selection} />
      )}
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

/** The toolbar EmbedPDF places next to a text selection. */
function TextSelectionMenu({
  menuWrapperProps,
  rect,
  placement,
  selection,
}: SelectionSelectionMenuProps & {
  selection: SelectionReporting;
}): React.JSX.Element {
  return (
    <div {...menuWrapperProps}>
      <div
        className="selection-menu"
        role="toolbar"
        aria-label="PDF text selection actions"
        style={{ top: placement.suggestTop ? -40 : rect.size.height + 6 }}
      >
        <AgentButtons selection={selection} />
      </div>
    </div>
  );
}

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

/** Space between a selected region and its menu, in pixels. */
const MENU_GAP = 6;

/**
 * The menu of a selected region: below it, or above it when there is no
 * room below in the viewer (a region dragged at the bottom of the screen).
 */
function RegionMenu({
  rect: [left, top, , bottom],
  scale,
  selection,
}: {
  rect: PageRect;
  scale: number;
  selection: SelectionReporting;
}): React.JSX.Element {
  const menu = useRef<HTMLDivElement>(null);
  const [above, setAbove] = useState(false);
  useLayoutEffect(() => {
    const element = menu.current;
    const page = element?.parentElement;
    const viewport = element?.closest(".viewport");
    if (!element || !page || !viewport) {
      return;
    }
    const place = (): void => {
      const pageTop = page.getBoundingClientRect().top;
      const view = viewport.getBoundingClientRect();
      const height = element.offsetHeight;
      const fitsBelow =
        pageTop + bottom * scale + MENU_GAP + height <= view.bottom;
      const fitsAbove = pageTop + top * scale - MENU_GAP - height >= view.top;
      setAbove(!fitsBelow && fitsAbove);
    };
    place();
    viewport.addEventListener("scroll", place, { passive: true });
    return () => viewport.removeEventListener("scroll", place);
  }, [bottom, scale, top]);
  const style: React.CSSProperties = above
    ? {
        left: left * scale,
        top: top * scale - MENU_GAP,
        transform: "translateY(-100%)",
      }
    : { left: left * scale, top: bottom * scale + MENU_GAP };
  return (
    // data-no-interaction: a press on the menu is not a click on the page,
    // which would start a new region or clear this one.
    <div
      ref={menu}
      className="selection-menu"
      role="toolbar"
      aria-label="PDF region actions"
      style={style}
      data-no-interaction
    >
      <AgentButtons selection={selection} />
    </div>
  );
}

/**
 * Copy Link for Agent copies the selection with its link (and opens an agent chat with it when one is available).
 * Plain copying of selected text is Cmd/Ctrl+C (see `useSelectionReporting`).
 */
function AgentButtons({
  selection,
}: {
  selection: SelectionReporting;
}): React.JSX.Element {
  return (
    <button type="button" onClick={() => void selection.copyLinkForAgent()}>
      Copy Link for Agent
    </button>
  );
}
