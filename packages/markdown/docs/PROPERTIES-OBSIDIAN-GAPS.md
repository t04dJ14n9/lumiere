# Lumière Properties ↔ Obsidian 1.14.4 — REA gap survey

**Date:** 2026-10-20 (Asia/Shanghai)  
**Obsidian evidence:** `/workspace/obsidian-rea/recovered/application/{app.css,app.js}` (REA pipeline; Obsidian 1.14.4)  
**Lumière:** `packages/markdown/src/plugins/properties/`  
**Prior docs:** `docs/properties-diff.md`, `/workspace/plans/obsidian-properties-behaviour.md`

Do not copy Obsidian code/CSS/assets. Gaps below are behaviour/layout targets.

Severity: **P0** height/remount or editing broken · **P1** clear visual/interaction mismatch · **P2** polish · **OK** matched or intentional · **N/A** OKF-only

---

## Shipped (open PRs — do not merge)

| ID | Gap | PR | Notes |
| --- | --- | --- | --- |
| G1 | Unfocused longtext expands fully; Obsidian clamps to 3 lines + `max-height: 300px`, clears clamp on focus | [#136](https://github.com/t04dJ14n9/lumiere/pull/136) | `app.css` `--metadata-input-longtext-lines: 3`; estimate capped |
| G2–G5 | Sheet 2rem margin, 0.875em font, row rings, 3px gap | [#137](https://github.com/t04dJ14n9/lumiere/pull/137) (base `#136`) | stacked chrome polish |

---

## High severity — fix next

| ID | Sev | Obsidian (rea) | Lumière today | Action |
| --- | --- | --- | --- | --- |
| G2 | P1 → PR | `.metadata-container { margin-block-end: 2rem; padding: var(--size-4-2) 0 }` → **8px 0** + **32px** below | `.properties { padding: 4px 0 16px }` — only 16px bottom, no margin-block-end | Match padding top 8px + `margin-block-end: 2rem`; sync `SHEET_PADDING` / `COLLAPSED` in `estimated-height.ts` |
| G3 | P1 → PR | `--metadata-label-font-size` / `--metadata-input-font-size: var(--font-smaller)` = **0.875em** | `.properties { font-size: var(--text-size) }` — full editor size; rows taller than Obsidian | Set sheet/inputs to `0.875em`; heading already ~0.875 of root — avoid double-shrink; set `TEXT=14` in estimate |
| G4 | P1 → PR | Row hover: `box-shadow: 0 0 0 1px border-hover`, radius 6px; focus-within: `0 0 0 2px border-focus` | `:focus-visible` outline 1px; no hover ring; radius 3px on selection | Add hover/focus-within rings (VS Code `--vscode-widget-border` / `--vscode-focusBorder`); radius 6px |

---

## Medium — layout tokens

| ID | Sev | Obsidian | Lumière | Action |
| --- | --- | --- | --- | --- |
| G5 | P2 → PR | `--metadata-gap: 3px` flex column on `.metadata-properties` | Rows stacked with `padding: 2px 0` each, no gap | `display:flex; flex-direction:column; gap:3px`; zero row vertical padding; adjust `ROW_PADDING` |
| G6 | P2 | `--metadata-label-width: 9em` fixed key column | `minmax(0, min(40%, 18em))` | **Keep** — intentional long-key editability (MW props) |
| G7 | P2 | `--metadata-input-padding: 4px 8px` on longtext | `padding: 0` on inputs | Add input padding; may affect clamp/estimate slightly |
| G8 | P2 | Heading title class `metadata-properties-title`; collapse `collapse-indicator collapse-icon` | Bare `<span>Properties</span>`; `metadata-collapse-indicator` | Optional class aliases for theme-ish parity (no Obsidian assets) |
| G9 | P2 | Add control: `.metadata-add-button.text-icon-button` + lucide-plus | `data-property-add` + fullwidth “＋” glyph | Cosmetic; low priority |
| G10 | P2 | `data-property-count` on container | Removed (properties-diff) | **Reject** — intentional |

---

## Interaction (mostly OK from prior parity)

| ID | Sev | Topic | Status |
| --- | --- | --- | --- |
| G11 | OK | Heading ArrowLeft/Right collapse; click toggle | Matched (`form.ts`) |
| G12 | OK | Per-note collapse persistence | Matched (`collapse-store`; coll.mjs) |
| G13 | OK | Type submenu / reserved tags·aliases·cssclasses | Matched (parity tests) |
| G14 | OK | Tab key→value→row; Delete removes; Backspace does not | Matched |
| G15 | OK | Caret never in frontmatter widget | Matched (`caret-guard`) |
| G16 | P2 | Obsidian heading has no Enter-toggle; Lumière Enter toggles | Minor extra; keep or drop |
| G17 | P2 | Obsidian `o` / `j`/`k` vim-ish on container | Lumière has vim `o` in row-nav; verify container-level parity |

---

## Complex / Sources (intentional differences)

| ID | Sev | Topic | Decision |
| --- | --- | --- | --- |
| G18 | N/A | Nested/`unknown` → Obsidian `JSON.stringify` + `lucide-file-question` | Lumière editable YAML drafts — **keep** (documented enhancement) |
| G19 | N/A | OKF `sources` stacked articles + disclosure + YAML | Removed. `sources` is a plain text property, same control as any other string |
| G20 | N/A | Sources expand session + remeasure | Widget removed with G19. Tall-sheet tests use plain text rows |
| G21 | N/A | Sources article chrome vs estimate `ARTICLE_CHROME` | Removed with the Sources widget. `sources` estimates as clamped text |

---

## Deferred / reject

| ID | Topic | Why |
| --- | --- | --- |
| G22 | Daily note link on date | No daily-note capability |
| G23 | Native date picker chrome | Chromium/OS |
| G24 | Theme colour exact match | VS Code tokens |
| G25 | Collapse global across vaults | Obsidian per-note (measured); workspace-scoped storage OK |

---

## Fix order for this worker

1. **G2+G3+G4+G5** stacked PR on `#136` (`fuzz/props-obsidian-chrome`) — CSS + `estimated-height` + exact unit asserts.
2. Re-check Sources estimate floors after chrome change (G21).
3. G7 input padding if tests stay green.
4. Leave G6/G18/G19 alone.

## References (rea)

- Tokens: `app.css` ~L2500–2545, container ~L12250, property ~L12383, longtext ~L12669
- MetadataEditor DOM: `app.js` ~offset creating `metadata-container` / `metadata-properties-heading` / `metadata-add-button`
- Unknown type widget: `mod-unknown` + `JSON.stringify` ~offset 1868319
