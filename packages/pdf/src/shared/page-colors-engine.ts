/**
 * Whether the pinned EmbedPDF version exposes a PDFium page color-scheme
 * hook (embedpdf#679). 2.15.x does not: dark paper fails closed to Normal
 * rendering (no CSS invert). Flip this when upgrading to a release that
 * wires `pageColors` / `FPDF_RenderPageBitmapWithColorScheme_Start`.
 */
export const PAGE_COLORS_ENGINE_AVAILABLE = false;

/**
 * Effective mode the viewer may apply to bitmaps and overlays. When the
 * engine hook is missing, always Normal regardless of the host's intent.
 */
export function renderablePageColors(
  effective: "normal" | "dark",
): "normal" | "dark" {
  return PAGE_COLORS_ENGINE_AVAILABLE ? effective : "normal";
}
