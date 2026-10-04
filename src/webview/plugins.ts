import { createPluginRegistration } from '@embedpdf/core';
import { BookmarkPluginPackage } from '@embedpdf/plugin-bookmark/react';
import { DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager/react';
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/react';
import { RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { ScrollPluginPackage } from '@embedpdf/plugin-scroll/react';
import { SearchPluginPackage } from '@embedpdf/plugin-search/react';
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/react';

/** The viewer shows one document under this id. */
export const DOCUMENT_ID = 'pdf';
export const ZOOM_RANGE = { min: 0.25, max: 4 } as const;
/** Pixels between pages (and around them). */
export const PAGE_GAP = 12;

/** The EmbedPDF plugins the viewer is built from, opening `buffer`. */
export function viewerPlugins(buffer: ArrayBuffer) {
  return [
    createPluginRegistration(DocumentManagerPluginPackage, {
      initialDocuments: [{ buffer, name: 'document.pdf', documentId: DOCUMENT_ID }],
    }),
    createPluginRegistration(ViewportPluginPackage, { viewportGap: PAGE_GAP }),
    createPluginRegistration(ScrollPluginPackage, { defaultPageGap: PAGE_GAP, defaultBufferSize: 2 }),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(InteractionManagerPluginPackage),
    createPluginRegistration(SelectionPluginPackage),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitWidth,
      minZoom: ZOOM_RANGE.min,
      maxZoom: ZOOM_RANGE.max,
      zoomStep: 0.1,
    }),
    createPluginRegistration(SearchPluginPackage, { showAllResults: true }),
    createPluginRegistration(BookmarkPluginPackage),
  ];
}
