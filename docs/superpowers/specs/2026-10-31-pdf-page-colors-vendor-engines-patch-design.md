# Design addendum: Vendor EmbedPDF `pageColors` (make dark paper work)

**Date:** 2026-10-31  
**Repo:** `t04dJ14n9/lumiere`  
**Package:** `packages/pdf`  
**Status:** Implemented / In PR  
**Parent design:** [2026-10-30-pdf-page-colors-dark-paper-design.md](2026-10-30-pdf-page-colors-dark-paper-design.md) (setting + status-bar UI already shipped in #454)  
**Upstream:** [embedpdf/embed-pdf-viewer#679](https://github.com/embedpdf/embed-pdf-viewer/issues/679) — still open, **no PR**

## Goal

Make **Follow (Dark)** / **Dark** actually darken PDF page bitmaps. Today the status bar shows the intent, but `PAGE_COLORS_ENGINE_AVAILABLE = false` fails closed to white Normal paper.

## Why this is feasible without a WASM rebuild

Pinned `@embedpdf/pdfium@2.15.1` already exports `FPDF_RenderPageBitmapWithColorScheme_Start` (and Continue/Close). The gap is only JS: `@embedpdf/engines` full-page path uses `FPDF_RenderPageBitmapWithMatrix`, which has no color-scheme argument. #679’s local 2.14.4 prototype describes the exact wiring we need.

## Decisions (this addendum)

| Topic | Decision |
|--------|----------|
| Delivery | **`pnpm patch`** on `@embedpdf/engines@2.15.1` (and `@embedpdf/models` types if options typing lives there). Prefer patch over a full vendor tree copy. Touch `@embedpdf/plugin-render` only if `pageColors` is stripped before the engine. |
| WASM | **Do not** rebuild or replace `pdfium.wasm`. |
| Engine flag | Flip `PAGE_COLORS_ENGINE_AVAILABLE` to **`true`** once the patched path is proven. |
| Full-page dark | Prefill bitmap background (~`#1e1e1e`) → `FPDF_RenderPageBitmapWithColorScheme_Start` with light text/path colors (match tokens already sketched in `page-bitmaps.tsx`) → Continue/Close. |
| Partial rect / annot bitmaps | **Keep Matrix** in v1 (or soft-fail to Normal for those calls). Full pages are the reading path. |
| CSS invert | Still **out** (parent design non-goal). |
| Scanned / image pages | Still stay bright (PDFium limit). Document in settings blurb. |
| Upstream | Optional later: contribute patch upstream. **Not** a merge gate for this PR. |
| Fail-closed clause | Superseded for 2.15.1: we **do** wire the hook ourselves instead of waiting on EmbedPDF. |

## Out of scope

- Sepia / grayscale / invert / custom palettes  
- CSS filter fallback for scans  
- Annotations product work  
- Bumping EmbedPDF major beyond 2.15.1 unless required for a clean patch  

## Implementation sketch (one PR)

1. Land this addendum under `docs/superpowers/specs/`.  
2. Create `pnpm patch` for engines: accept `pageColors` on `PdfRenderPageOptions`; branch full-page render when colors present.  
3. Ensure Lumière `renderOptions()` in `page-bitmaps.tsx` passes the object when flag is true (already drafted).  
4. Set `PAGE_COLORS_ENGINE_AVAILABLE = true`; update `contributes.json` / settings copy.  
5. Unit tests for option plumbing + flag; refresh overlays already contrast-aware.  
6. Host GUI + screenshots (Medium risk): born-digital text PDF under Follow+dark and Dark; Normal white; one scanned page still bright; cycle updates without reload.

## Risk

**Medium** — changes the page raster path; patch must be rebased on every EmbedPDF bump. Mitigate with a short `packages/pdf/docs/embedpdf-page-colors-patch.md` note (what we patched, how to refresh).

## Success

Under a dark editor theme with default `follow`, a typical arXiv text/vector PDF shows dark paper and light text/vectors; status bar **Follow (Dark)** matches what you see; images/scans remain as-authored.
