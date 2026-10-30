# Mermaid Obsidian visual parity (theme + native size)

**Date:** 2026-10-30 (Asia/Singapore)  
**Status:** Approved for implementation (design OK; fit-width audit folded in)  
**Repo:** Workshop / Lumière (`https://github.com/t04dJ14n9/lumiere`)  
**Owner agent:** Mermaid Parity  
**REA sources:** `/workspace/mermaid-parity-rea/REPORT.md`, `/workspace/mermaid-parity-rea/FITWIDTH-AUDIT.md`, Obsidian 1.14.4 extract

## Goal

Make Live Preview Mermaid in Lumière **look and size like Obsidian Live Preview**: theme-aware colors via Obsidian’s CSS invert (not Mermaid `theme:"dark"`), Obsidian typography tokens, and Obsidian native SVG size + horizontal scroll. Do **not** invent a new skin. Do **not** redo #445 / #446 unless Host GUI proves a residual shrink.

## Decisions (user)

| Topic | Choice |
| --- | --- |
| Colors | Approach 1: CSS-invert dark parity (approved) |
| Size | Match Obsidian native size + `overflow-x` scroll; no fit-to-pane for types Obsidian leaves native |
| Fit-width audit | Required before this spec; findings below |
| Prior PRs | Keep #446 (useMaxWidth map, SVG `max-width: none`, overflow-x, height grows) and #445 (lightbox theme-id keep) |

## Obsidian REA baseline

- Mermaid **initialize** (no `theme` key → Mermaid **default / light** palette):
  - `startOnLoad: false`, `securityLevel: "strict"`
  - `themeVariables: { fontFamily: "var(--font-mermaid)" }`
  - `useMaxWidth: false` — flowchart, sequence, gitGraph, er
  - `useMaxWidth: true` — gantt, journey, class, state, pie
- Token: `--font-mermaid: var(--font-text)` on `body`
- Dark UI: **not** Mermaid dark theme. CSS only:

```css
.theme-dark .mermaid > svg {
  filter: invert(100%) hue-rotate(180deg) saturate(1.25);
}
```

- LP host: `.markdown-source-view.mod-cm6 .cm-embed-block > .mermaid { overflow-x: auto; }`
- Staging width = note / content width (absolute hidden div)
- Obsidian ships **mermaid@11.13.0**; Lumière uses **mermaid@12.2.0** (known delta; do not downgrade in this work unless Host GUI proves 12 is the size bug)

## Current Lumière gap

### Colors (primary “ugly” look)

`packages/markdown/src/plugins/diagrams/renderer.ts` picks Mermaid theme from `document.body.classList.contains("vscode-light")` → `"default"` / `"dark"`, and embeds that in `cacheKeyFor` + `lastInitKey`. Stock Mermaid dark is the muted gray palette in user screenshots — **not** Obsidian’s invert look.

### Size (post-#446)

Already correct in CSS / init:

- `diagrams.css`: `pre[data-fence="mermaid"] svg { max-width: none; height: auto; }` + host `overflow-x: auto`
- Per-type `useMaxWidth` map matches Obsidian

**Still wrong for Obsidian-native sizing:**

1. **`mermaid-height.ts` still models fit-width.** Comment: “Diagrams wider than the note scale down to fit…”. Helper `fitted(height, naturalWidth, width) = height * min(1, width/naturalWidth)` is used for **flowchart** and **sequence** height guesses. That mismatches `useMaxWidth: false` (native pixel SVG). Tests in `mermaid-height.test.ts` still expect some fixtures (`messages`, `pipeline`) to shrink height when the pane narrows (731 vs 1211) — fit-width world, not native.
2. Mermaid 12 `calculateSvgSizeAttrs`: `useMaxWidth: true` → `width="100%"` + `style="max-width: Npx"` (intentional for class/state/pie/gantt/journey — Obsidian same). Leave those alone.
3. Staging width = `.cm-content` clientWidth — same idea as Obsidian; leave unless Host GUI shows mismatch.
4. Ruled out as primary shrink: DOMPurify strip of width, global `img`/`mjx` max-width rules, `.hybrid-block { max-width: 100% }` alone (with pixel SVG + overflow-x should scroll).

## Design

### 1. Colors — CSS invert (Lumière body classes)

Stop passing Mermaid `theme: "dark"`. Always initialize with Mermaid **default** (omit `theme`, or set `"default"` explicitly). Keep trust / htmlLabels / securityLevel / useMaxWidth map / fontFamily as today (post-#446).

Add Obsidian’s filter under Lumière’s light/dark body classes (VS Code webview uses `vscode-light` / `vscode-high-contrast-light` for light; everything else is dark):

```css
/* Obsidian app.css: .theme-dark .mermaid > svg */
body:not(.vscode-light):not(.vscode-high-contrast-light)
  pre[data-fence="mermaid"]
  > svg {
  filter: invert(100%) hue-rotate(180deg) saturate(1.25);
}
```

Apply the same filter to **lightbox / inspect** Mermaid SVG clones so zoomed view matches LP (selector may be the inspect host’s SVG; keep #445 id rewrite).

Do **not** invent custom `themeVariables` colors for dark.

### 2. Font token

Define on the markdown webview root (e.g. `body` / `#app` in `base.css` or diagrams CSS):

```css
--font-mermaid: var(--vscode-editor-font-family, inherit);
```

Obsidian maps `--font-mermaid` → `--font-text`. Lumière’s editor face is the closest stand-in until a shared `--font-text` exists. Keep `themeVariables.fontFamily: "var(--font-mermaid, …)"` in initialize.

### 3. Cache / re-init keys

Because the SVG is always the default palette and dark is CSS-only:

- **Drop Mermaid theme from `cacheKeyFor` and `lastInitKey`.** Key on trust + source (and any other non-appearance axes already required).
- Theme / appearance toggles must **not** force Mermaid re-render; CSS filter handles it. If the webview remounts on theme change anyway, that is fine — do not add an extra invalidate for appearance.

Update any unit tests that assert `theme: "dark"` in initialize options.

### 4. Native size — height reserve aligned with useMaxWidth

In `packages/markdown/src/webview/ui/mermaid-height.ts`:

- For diagram types with Obsidian `useMaxWidth: false` (flowchart, sequence, git, er): **stop calling `fitted()`**. Return the natural height estimate independent of pane width (still accept `widthPx` for types that stay width-dependent).
- For `useMaxWidth: true` types (gantt, journey, class, state, pie): keep width-aware estimates only if Host GUI / DRAWN remounts still show height changing with pane width; otherwise simplify.
- Rewrite the top-of-file comment that claims diagrams “scale down to fit.”
- Re-baseline `mermaid-height.test.ts` DRAWN expectations after measuring native-size SVGs (Host GUI or Chromium harness). Fixtures that currently differ at 731 vs 1211 solely due to `fitted()` must become equal (or match new measured native heights).

Do **not** change `diagrams.css` `max-width: none` / overflow-x unless Host GUI proves residual CSS shrink.

### 5. Out of scope

- Downgrading Mermaid 12 → 11
- foreignObject / htmlLabels sanitize follow-ups
- New Mermaid skin / custom dark `themeVariables`
- Replacing lightbox zoom with inline pinch zoom
- Unrelated Lumière work (hand back to other agents)

## Acceptance

1. **Dark LP:** flowchart/sequence look like Obsidian dark (inverted default palette), not stock Mermaid dark grays.
2. **Light LP:** unchanged default Mermaid palette (no invert).
3. **Native size:** small flowchart does not grow to fill the pane; wide flowchart keeps readable node size and scrolls horizontally (`overflow-x`).
4. **useMaxWidth true types:** still may fit width (Obsidian parity).
5. **Theme toggle:** no Mermaid SVG cache miss solely for light↔dark; filter applies immediately if DOM stays.
6. **Height reserve:** flowchart/sequence guesses no longer shrink with narrower `widthPx`; tests updated.
7. **Host GUI:** verified on a real Cursor/VS Code client (message @Slave). PR description includes before/after screenshots (repro dark “ugly”, after invert; small + wide flowchart size).
8. Cloud Agent for implementation: latest Grok only, max context + max reasoning, fast mode off.

## Files (expected)

| Path | Change |
| --- | --- |
| `packages/markdown/src/plugins/diagrams/renderer.ts` | Always default theme; trust-only init/cache keys |
| `packages/markdown/src/plugins/diagrams/diagrams.css` | Dark invert filter; optional `--font-mermaid` if not in base |
| `packages/markdown/src/webview/styles/base.css` | `--font-mermaid` token if preferred here |
| Lightbox / inspect CSS or clone host | Same invert in dark |
| `packages/markdown/src/webview/ui/mermaid-height.ts` | Drop `fitted()` for native types |
| `packages/markdown/src/webview/ui/mermaid-height.test.ts` | Re-baseline DRAWN |
| `packages/markdown/src/plugins/diagrams/mermaid-guard.test.ts` (or renderer tests) | Stop expecting `theme: "dark"` |

## Verification plan

1. Unit: initialize options omit dark theme; cache key ignores appearance; height tests for native types width-invariant.
2. Host GUI (@Slave): side-by-side Obsidian vs Lumière dark/light; dump SVG `width`/`style` attrs for small + wide flowchart; screenshots for PR.
3. Regression: #445 lightbox ids; #446 overflow-x / no CSS max-width 100% on Mermaid SVG.
