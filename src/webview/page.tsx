import type { PdfDocumentObject } from '@embedpdf/models';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/react';
import { RenderLayer } from '@embedpdf/plugin-render/react';
import { SearchLayer } from '@embedpdf/plugin-search/react';
import { SelectionLayer, type SelectionSelectionMenuProps } from '@embedpdf/plugin-selection/react';
import React from 'react';
import type { PageRect } from '../shared/geometry';
import type { RegionSelection } from '../shared/selection';
import type { Highlight } from './navigation';
import { PageLinks } from './page-links';
import { DOCUMENT_ID } from './plugins';
import { renderPixelRatio } from './render-resolution';
import type { SelectionReporting } from './selection';

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
  onOpenPage: (page: number) => void;
}

/**
 * One page, as layers from bottom to top: the rendered image, search hits,
 * clickable links, a highlighted location, the selected region, and
 * EmbedPDF's text selection (which also draws the region being dragged).
 */
export function Page({
  pdf, pageIndex, width, height, devicePixelRatio, highlight, region, selection, onOpenPage,
}: PageProps): React.JSX.Element {
  const page = pageIndex + 1;
  const scale = width / Math.max(1, pdf.pages[pageIndex]?.size.width ?? width);
  return (
    <PagePointerProvider
      documentId={DOCUMENT_ID}
      pageIndex={pageIndex}
      scale={scale}
      className="page"
      style={{ width, height }}
      data-page-index={pageIndex}
    >
      <RenderLayer
        documentId={DOCUMENT_ID}
        pageIndex={pageIndex}
        scale={scale}
        dpr={renderPixelRatio(scale, devicePixelRatio, width, height)}
        className="page-image"
        draggable={false}
      />
      <SearchLayer documentId={DOCUMENT_ID} pageIndex={pageIndex} scale={scale} />
      <PageLinks pdf={pdf} pageIndex={pageIndex} scale={scale} onOpenPage={onOpenPage} />
      {highlight?.page === page && (
        <Box key={highlight.key} className="location-highlight" rect={highlight.rect} scale={scale} />
      )}
      {region?.page === page && (
        <>
          <Box className="region-selection" rect={region.rect} scale={scale} />
          <div className="selection-menu" role="toolbar" aria-label="PDF region actions" style={menuBelow(region.rect, scale)}>
            <button type="button" onClick={() => void selection.copyForAgent()}>Copy for Agent</button>
          </div>
        </>
      )}
      <SelectionLayer
        documentId={DOCUMENT_ID}
        pageIndex={pageIndex}
        scale={scale}
        textStyle={{ background: 'var(--selection-fill)' }}
        marqueeStyle={{ background: 'var(--selection-soft)', borderColor: 'var(--selection-edge)', borderStyle: 'solid' }}
        marqueeClassName="region-marquee"
        selectionMenu={props => <TextSelectionMenu {...props} selection={selection} />}
      />
    </PagePointerProvider>
  );
}

/** The toolbar EmbedPDF places next to a text selection. */
function TextSelectionMenu({ menuWrapperProps, rect, placement, selection }:
  SelectionSelectionMenuProps & { selection: SelectionReporting }): React.JSX.Element {
  return (
    <div {...menuWrapperProps}>
      <div
        className="selection-menu"
        role="toolbar"
        aria-label="PDF text selection actions"
        style={{ top: placement.suggestTop ? -40 : rect.size.height + 6 }}
      >
        <button type="button" onClick={() => void selection.copyForAgent()}>Copy for Agent</button>
        <button type="button" onClick={selection.copyText}>Copy text</button>
      </div>
    </div>
  );
}

function Box({ rect, scale, className }: { rect: PageRect; scale: number; className: string }): React.JSX.Element {
  const [left, top, right, bottom] = rect;
  return (
    <div
      className={className}
      style={{ left: left * scale, top: top * scale, width: (right - left) * scale, height: (bottom - top) * scale }}
    />
  );
}

function menuBelow([left, , , bottom]: PageRect, scale: number): React.CSSProperties {
  return { left: left * scale, top: bottom * scale + 6 };
}
