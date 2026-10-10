import { createPluginRegistration } from "@embedpdf/core";
import { BookmarkPluginPackage } from "@embedpdf/plugin-bookmark/react";
import { DocumentManagerPluginPackage } from "@embedpdf/plugin-document-manager/react";
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/react";
import { RenderPluginPackage } from "@embedpdf/plugin-render/react";
import {
  ScrollPluginPackage,
  ScrollStrategy,
} from "@embedpdf/plugin-scroll/react";
import { SearchPluginPackage } from "@embedpdf/plugin-search/react";
import { SelectionPluginPackage } from "@embedpdf/plugin-selection/react";
import { SpreadPluginPackage } from "@embedpdf/plugin-spread/react";
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { ZoomPluginPackage } from "@embedpdf/plugin-zoom/react";
import { MAX_ZOOM, MIN_ZOOM } from "../shared/zoom-steps";
import { autoZoom, rememberedPosition } from "./reading-position";
import { nativeSpread } from "./spread-mode";

/** The viewer shows one document under this id. */
export const DOCUMENT_ID = "pdf";
export const ZOOM_RANGE = { min: MIN_ZOOM, max: MAX_ZOOM } as const;
/** Pixels between pages (and around them). */
export const PAGE_GAP = 12;

/** The EmbedPDF plugins the viewer is built from, opening `buffer`. */
export function viewerPlugins(buffer: ArrayBuffer) {
  const position = rememberedPosition();
  return [
    createPluginRegistration(DocumentManagerPluginPackage, {
      initialDocuments: [
        { buffer, name: "document.pdf", documentId: DOCUMENT_ID },
      ],
    }),
    createPluginRegistration(ViewportPluginPackage, { viewportGap: PAGE_GAP }),
    createPluginRegistration(SpreadPluginPackage, {
      defaultSpreadMode: nativeSpread(position.pageLayout),
    }),
    createPluginRegistration(ScrollPluginPackage, {
      defaultPageGap: PAGE_GAP,
      defaultBufferSize: 2,
      defaultStrategy:
        position.scrollDirection === "horizontal"
          ? ScrollStrategy.Horizontal
          : ScrollStrategy.Vertical,
    }),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(InteractionManagerPluginPackage),
    createPluginRegistration(SelectionPluginPackage),
    createPluginRegistration(ZoomPluginPackage, {
      // A number would leave the viewport gated until a zoom request; the restored
      // number is requested once the document is shown (useRestorePosition).
      defaultZoomLevel: autoZoom(position.zoom),
      minZoom: ZOOM_RANGE.min,
      maxZoom: ZOOM_RANGE.max,
      zoomStep: 0.1,
    }),
    createPluginRegistration(SearchPluginPackage, { showAllResults: true }),
    createPluginRegistration(BookmarkPluginPackage),
  ];
}
