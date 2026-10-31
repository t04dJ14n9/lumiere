# EmbedPDF `pageColors` engines patch

Lumière dark paper depends on a **`pnpm patch`** of `@embedpdf/engines@2.15.1`
(and a small `@embedpdf/models@2.15.1` types patch). Upstream
[embedpdf/embed-pdf-viewer#679](https://github.com/embedpdf/embed-pdf-viewer/issues/679)
is still open; PDFium WASM already exports
`FPDF_RenderPageBitmapWithColorScheme_Start`, but stock engines JS only calls
`FPDF_RenderPageBitmapWithMatrix`.

## What the engines patch does

- Accepts `pageColors` on `PdfRenderPageOptions` (object or `'dark'` / `'normal'`).
- On **full-page** renders when color-scheme colors are present:
  - Prefills the bitmap with `pageColors.background` (default white / transparent otherwise).
  - Calls `FPDF_RenderPageBitmapWithColorScheme_Start` + `Continue` / `Close`
    with an `FPDF_COLORSCHEME` (path/text fill and stroke).
  - Optionally sets `FPDF_CONVERT_FILL_TO_STROKE` when `convertFillToStroke` is true.
- **Partial rect** and annotation bitmaps stay on the Matrix path (v1).
- Covers both `pdfium-direct-engine` and `pdfium-worker-engine` bundles.

Patch files:

- `patches/@embedpdf__engines@2.15.1.patch`
- `patches/@embedpdf__models@2.15.1.patch` (`pageColors` on `PdfRenderPageOptions`)

Declared in `pnpm-workspace.yaml` → `patchedDependencies`.

## Lumière wiring

- `PAGE_COLORS_ENGINE_AVAILABLE = true` in
  `packages/pdf/src/shared/page-colors-engine.ts`.
- `packages/pdf/src/webview/page-bitmaps.tsx` `renderOptions()` passes
  background `#1e1e1e` and text/path `#e8e6e3` when effective mode is dark.

## Refreshing on an EmbedPDF bump

1. Bump `@embedpdf/engines` / `@embedpdf/models` (and peers) together.
2. Re-apply or recreate the patch:
   - `pnpm patch @embedpdf/engines@<new>`
   - Port the `resolveEmbedPdfPageColors` helper and the `renderRectEncoded`
     color-scheme branch onto the new dist bundles (direct + worker, ESM + CJS).
   - `pnpm patch-commit <edit-dir>`
   - Same for models types if the upstream interface still lacks `pageColors`.
3. Run `pnpm install`, then PDF unit / browser checks.
4. If upstream ships #679-equivalent wiring, delete both patches, remove
   `patchedDependencies` entries, and keep the Lumière flag true.

## Limits

PDFium color scheme does **not** recolor embedded images or scanned page
content; those stay as-authored (often bright).
