/**
 * Whether the pinned EmbedPDF engines build exposes a PDFium page
 * color-scheme hook (embedpdf#679). Wired via `pnpm patch` on
 * `@embedpdf/engines@2.15.1` (see packages/pdf/docs/embedpdf-page-colors-patch.md):
 * full-page renders honor `pageColors` through
 * `FPDF_RenderPageBitmapWithColorScheme_Start`. Flip back to false if the
 * patch is dropped before an upstream release covers the same path.
 */
export const PAGE_COLORS_ENGINE_AVAILABLE = true;

/**
 * Effective mode the viewer may apply to bitmaps and overlays. When the
 * engine hook is missing, always Normal regardless of the host's intent.
 */
export function renderablePageColors(
  effective: "normal" | "dark",
): "normal" | "dark" {
  return PAGE_COLORS_ENGINE_AVAILABLE ? effective : "normal";
}
