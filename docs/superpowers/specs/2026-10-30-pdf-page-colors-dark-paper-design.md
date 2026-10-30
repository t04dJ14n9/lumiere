# Design: PDF page colors — dark paper (PDFium color scheme)

**Date:** 2026-10-30  
**Repo:** `t04dJ14n9/lumiere`  
**Package:** `packages/pdf` (`@workshop/pdf`)  
**Status:** Owner-approved design; ready for implementation plan  
**Upstream reference:** [embedpdf/embed-pdf-viewer#679](https://github.com/embedpdf/embed-pdf-viewer/issues/679) (PDFium page color scheme; chrome theme is separate)

## Goal

Give Lumière PDF a **page colors** mode that turns the rendered page surface dark for comfortable reading under dark editor themes: **dark paper** plus recolored **text and vectors**, while leaving **embedded images unchanged**.

Today every page is white paper in every VS Code theme (`packages/pdf/src/webview/styles/base.css` documents overlays tuned for white). A bright page on a dark chrome is jarring; this design closes that gap without CSS invert hacks.

## Non-goals (v1)

- Recoloring or filtering **scanned / image-only** page content (PDFium color scheme does not touch bitmaps).
- CSS `filter` / invert / sepia / grayscale **fallback** when the engine hook is missing.
- Sepia, grayscale, invert, or custom RGB page palettes (follow-ups; #679 sketches a wider preset set).
- PDF **annotations**, rotate, pan, or fullscreen (separate tracks; annotations design is elsewhere).
- Changing EmbedPDF **viewer chrome** theming (already follows the host webview theme).
- Persisting a per-document page-color override distinct from the workspace/user setting.

## Decisions (locked)

| Topic | Decision |
|--------|----------|
| Goal | Mode to turn PDF **page background** dark for reading comfort. |
| Visual effect | **Dark paper** + recolor **text/vectors only**; **images stay as-is**. |
| Setting | `lumiere.pdf.pageColors` ∈ `follow` \| `normal` \| `dark`. |
| Default | `follow`. |
| Follow mapping | VS Code `window.activeColorTheme.kind`: `Dark` and `HighContrast` → effective **dark**; `Light` and `HighContrastLight` → effective **normal**. |
| Controls | **Page colors** cycle (`Follow` → `Normal` → `Dark` → …) on the VS Code **status bar** only (plus Settings / command palette). No slim top bar, no floating bar. |
| Toolbar product | **Remove `slim` and `floating`** from `lumiere.pdf.toolbar.mode`. Status bar is the **only** PDF control surface (see [Related product change](#related-product-change-status-bar-only)). |
| Engine approach | **PDFium page color scheme at render time** (closest to embedpdf#679). **No** CSS invert/filter fallback in v1. |
| Fail-closed | If the color-scheme hook is **unavailable** on EmbedPDF **2.15.x** (current pin), stay on effective **Normal** and document the gap in the implementation PR — never muddy CSS. |
| Scope | Page colors **plus** consolidating PDF controls onto the status bar (remove slim/floating). Still **not** annotations, rotate, pan, or fullscreen. |

## Architecture

### Effective mode

```
lumiere.pdf.pageColors + (if follow) ColorThemeKind
        → effectivePageColors: "normal" | "dark"
        → host posts to webview
        → EmbedPDF / PDFium render with color scheme
        → refresh rendered pages on change
        → overlays become contrast-aware when effective dark
```

1. **Host** (`packages/pdf` extension) reads `lumiere.pdf.pageColors` and, when the value is `follow`, resolves `vscode.window.activeColorTheme.kind` to `normal` or `dark`.
2. Host posts an explicit **effective** mode to the webview (do not make the webview re-derive theme kind; the host owns Follow).
3. **Webview** applies the mode to the render path (render plugin / engine options aligned with #679’s shape: page background fill + `FPDF_RenderPageBitmapWithColorScheme_Start`-style text/path colors when available).
4. On setting change **or** (when Follow) theme-kind change, host recomputes effective mode, posts again, and the viewer **invalidates / refreshes** page bitmaps so open PDFs update without reload.
5. **Overlays** (selection fill, region outline, jump flash, link accents — today tuned for white paper in `base.css`) switch to a **contrast-aware** token set when effective mode is `dark`, so marks stay visible on dark paper.

### Setting and contributions

- Add `lumiere.pdf.pageColors` to `packages/pdf/contributes.json` configuration (enum `follow` | `normal` | `dark`, default `follow`, short description that Follow tracks the editor color theme kind).
- Regenerated / synced `package.json` contributions follow the existing PDF settings pipeline so **PDF: Change Setting…** and **PDF: Open Settings** pick it up automatically.
- Scope: same as peer PDF view settings (user/workspace; write path matches other toggle/cycle commands).

### Related product change (status-bar only)

Owner lock (2026-10-30): **put the whole PDF toolbar on the status line.** Delete **slim** and **floating** as modes — no slim top bar, no floating bar over pages. The VS Code **status bar** is the only in-editor control surface (plus Settings / command palette).

Implications beyond page-colors:

- Remove `slim` | `floating` from `lumiere.pdf.toolbar.mode` (and **PDF: Choose Toolbar Location…**). Migrate any saved `slim`/`floating` values to status-bar chrome (or equivalent default).
- **Editor-title** PDF navigation icons that today appear under chrome should **move into / already live on the status bar** — do not keep a parallel title-bar control strip once slim/floating are gone. Prefer one status-bar cluster rather than title + status duplication.
- Keep fine-grained hide via existing `lumiere.pdf.toolbar.statusBarButtons` (and similar) so users can drop optional status buttons without resurrecting slim/floating. Prefer **not** retaining a separate `none` toolbar mode if `statusBarButtons` (or Settings) already covers “keyboard/menu only”; if `none` stays briefly for migration, it means no status PDF entries — Settings + command palette only — not a viewer bar.
- Zen mode today forces a floating bar for chrome/slim (`packages/pdf/src/shared/zen.ts`): redesign zen to status-bar / command-only chrome (no floating overlay bar) as part of this consolidation.
- Touch points (illustrative): `toolbar-settings.ts`, `pdfToolbar/*`, `toolbar.tsx`, `floating-toolbar.tsx`, contributes `toolbar.mode`, README / docs images.

**Plan sequencing (choose in the implementation plan, prefer one plan):** either (a) **prerequisite slice** — remove slim/floating + consolidate onto status bar, then page-colors as a follow-up commit/PR — or (b) **same implementation PR** — status-bar consolidation and page-colors entry together. Prefer documenting both options in the plan and picking one; this design assumes page-colors is **one new status-bar entry in a status-bar-only world**.

### UI surface (Page colors cycle)

- **Only** the VS Code **bottom status bar**, alongside find / View / page / zoom. Touch `packages/pdf/src/extension/plugins/pdfToolbar/status-bar.ts`, `status-bar-layout.ts`, and `STATUS_BAR_ORDER`.
- Placement: **near `view`**, **left of** `page` / zoom so page+zoom stay rightmost — e.g. left-to-right `find`, `view`, **`pageColors`**, `page`, … Layout to extend: `packages/pdf/docs/images/toolbar-chrome-dark.png`.
- Plus **Settings** (`lumiere.pdf.pageColors`) and **command palette** (cycle/set command; same key, no parallel state).
- **No** slim/floating viewer-bar parity path for this control (those modes are removed).
- Cycle order: **Follow → Normal → Dark → Follow**.
- Label / tooltip reflects the **setting** value (Follow / Normal / Dark), not only the effective mode; when Follow is selected, the UI may optionally hint the effective side (e.g. “Follow (Dark)”) without writing `dark` into the setting.

### Engine integration (EmbedPDF 2.15.x)

- Prefer the public / plugin API if EmbedPDF exposes `pageColors` (or equivalent) on the render plugin by the time of implementation.
- If not yet public at 2.15.1, implement against the **engine render options** Lumière already owns (`engine.tsx` / render session) only when the PDFium color-scheme entry point is reachable **without** forking EmbedPDF for a muddy CSS path.
- **Fail closed:** if the hook cannot be wired cleanly on the pinned EmbedPDF version, effective mode stays **Normal**, status-bar/Settings controls still exist (or are gated), and the implementation PR **notes** the upstream gap and links #679 — **no** CSS `filter: invert()` (or similar) stopgap.
- Dark palette (initial): dark page background (near editor-dark paper, e.g. ~`#1e1e1e` class) with light text/path fill/stroke suitable for reading; exact tokens chosen in implementation to match host chrome without pretending to invert images.

### Limits (product-visible)

- **Scanned / image pages** remain bright: PDFium’s color scheme does not recolor embedded images. Document this in README / settings description so users are not surprised.
- Annotations, rotate, pan, fullscreen remain out of this change set even if their overlays later need the same contrast tokens.

## Data flow

```
Settings / status-bar cycle / command
  → write lumiere.pdf.pageColors
  → host resolveEffective(pageColors, theme.kind)
  → postMessage { type: "pageColors", effective: "normal"|"dark" }  (name illustrative)
  → webview render session uses color scheme + background fill
  → page bitmaps refresh; overlay CSS vars switch for dark paper
```

Theme listener (Follow only): `onDidChangeActiveColorTheme` → same resolve → post if effective changed.

## Testing

- **Unit:** `resolveEffective(pageColors, kind)` matrix for all four `ColorThemeKind` values × `follow`/`normal`/`dark`; setting default `follow`; cycle order Follow→Normal→Dark; no effective change when Follow and kind stays in the same light/dark bucket.
- **Unit / webview (as feasible without full WASM):** when effective flips, render/refresh is requested; overlay token path selects dark vs white-paper set.
- **Host GUI:** confirm **Page colors** on the **status bar** near View (see `toolbar-chrome-dark.png`); cycle works; no slim/floating bars remain after consolidation. Text-heavy PDF under **Dark** and under **Follow** with a dark theme — page paper dark, text light, images (if any) unchanged; same files under **Normal** / Follow+light theme — white paper as today; **scanned PDF** under Dark — page stays largely bright (expected); theme switch with Follow updates open viewer without manual reload. Smoke Settings + command palette; optional `statusBarButtons` hide path.
- **Fail-closed note:** if implementation lands without the engine hook, tests assert Normal rendering and the PR body states the limitation explicitly.

## Out of scope / follow-ups

- Sepia / grayscale / invert / custom `FPDF_COLORSCHEME` presets from #679.
- Post-render image filters for scanned pages.
- Per-PDF remembered page color.
- Annotations / rotate / pan / fullscreen feature work (separate specs/plans).
- Upstream contribution back to EmbedPDF if Lumière prototypes the engine wiring first.
- Reintroducing slim or floating toolbars.

## Success criteria

- Fresh install: `lumiere.pdf.pageColors` defaults to `follow`; dark editor themes get dark paper + recolored text/vectors on born-digital PDFs; light themes stay normal.
- **Page colors** cycle lives on the status bar; Settings and command palette agree on the stored enum; Follow tracks theme kind without writing Normal/Dark into settings.
- After consolidation: no slim top bar, no floating bar; PDF view controls (including former chrome title actions that belong with navigation) live on the status bar; users can still hide optional status buttons via `statusBarButtons`.
- Images and scans are not falsely “darkened” by CSS; unavailable engine hook fails closed to Normal with an explicit PR note.
- Selection / region / jump overlays remain readable on both white and dark paper.
- No annotation, rotate, pan, or fullscreen feature work ships in the page-colors / status-bar consolidation implementation.
