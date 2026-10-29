# Wide-block Obsidian parity (Mermaid, images, tables)

**Date:** 2026-10-29  
**Status:** Approved for implementation planning  
**Approach:** CSS-first Obsidian parity (not a shared viewport refactor)

## Goal

Keep diagram / image / table content at a **steady, readable size** in Live Preview. Wide content must **not shrink to fit** the editor pane; it scrolls horizontally instead. Mermaid zoom stays in the existing lightbox/inspect UI only.

## Decisions (user)

| Topic | Choice |
| --- | --- |
| Mermaid target | Obsidian parity: native size + scroll; zoom only in lightbox |
| Inline scroll | Match Obsidian: `overflow-x` only; block height grows with content |
| `useMaxWidth` | Match Obsidian per diagram type |
| Images & tables | Same idea: natural width + `overflow-x` scroll (no shrink-to-fit) |
| Approach | CSS-first parity (not shared wide-block wrapper; not per-plugin drift copies) |

## Obsidian REA baseline

From recovered Obsidian application sources (`obsidian-rea`):

- `mermaid.initialize` sets:
  - `useMaxWidth: false` — flowchart, sequence, git, er
  - `useMaxWidth: true` — gantt, journey, class, state, pie
  - `themeVariables.fontFamily: "var(--font-mermaid)"` with `--font-mermaid: var(--font-text)`
- Live Preview CSS: `.markdown-source-view.mod-cm6 .cm-embed-block > .mermaid { overflow-x: auto; }`
- No inline Mermaid pinch/wheel zoom; expand/lightbox is separate
- No vertical max-height on the Mermaid host (height follows the SVG)

## Current Lumière gap

- `packages/markdown/src/plugins/diagrams/diagrams.css` sets `pre[data-fence="mermaid"] svg { max-width: 100%; height: auto; }`, which shrinks wide SVGs and makes labels unreadably small (user screenshot: wide flowchart).
- `DiagramRenderer` `mermaid.initialize` does not set Obsidian’s per-type `useMaxWidth` flags or `--font-mermaid`-style font family.
- Images / tables: confirm any shrink-to-fit (`max-width: 100%` / width clamping) that fights natural width; keep Lumière image zoom/resize chrome and table column resize — this work only stops auto-shrinking.

## Design

### Mermaid

1. **Initialize** (in `renderer.ts`, next to existing theme/trust init) to mirror Obsidian:
   - `themeVariables: { fontFamily: "var(--font-mermaid, var(--vscode-editor-font-family, inherit))" }` (or equivalent token already used for note text)
   - Per-type `useMaxWidth` as above
2. **CSS:** remove shrink-to-fit on the inline SVG (`max-width: 100%` / equivalent). Keep hit-testing / pointer-events / internal-link cursor rules.
3. **Host:** `overflow-x: auto` on the Mermaid fence/wrapper; do **not** add a height cap; vertical space grows with the diagram.
4. **Lightbox:** unchanged zoom/inspect behavior; no new inline pan/zoom.

### Images

1. Ensure natural-width images are not forced to pane width when that shrinks them below natural size for the “don’t shrink” case.
2. Host/wrapper: `overflow-x: auto` when content is wider than the pane.
3. **Keep** existing image zoom toolbar, fit/actual, pan, resize corner, and lightbox — out of scope to remove.

### Tables

1. Wide tables already use horizontal scroll (`.table-scroll` / related). Audit for any shrink-to-fit that compresses cell text or columns against Obsidian.
2. Prefer overflow-x over fitting the pane when natural table width exceeds the editor.
3. **Keep** column drag-resize and `<!-- lumiere-col-widths -->` persistence from #445.

### Shared guidance (not a new abstraction)

Apply the same CSS/host rules in each plugin. Do **not** introduce a shared “wide block viewport” component in this pass (rejected alternative). Document the Obsidian flags and overflow rule in diagrams README (and brief notes in embeds/tables READMEs if behavior changes).

## Out of scope

- Image-style pan/zoom on inline Mermaid
- Vertical height caps / nested vertical scroll for Mermaid
- Shared wide-block viewport refactor
- Removing Lumière image zoom/resize chrome
- Changing table column-resize UX
- Mermaid `foreignObject` / `htmlLabels` sanitize follow-up (tracked separately)

## Acceptance

- Wide flowchart / sequence: labels remain readable at note-like size; pane shows horizontal scrollbar when wider than the editor; block height matches diagram height.
- Gantt (and other `useMaxWidth: true` types): still allow Mermaid’s max-width behavior per Obsidian.
- Lightbox Mermaid still opens and zooms as today; theme id clone behavior from #445 preserved.
- Wide image / table: no shrink-to-fit that makes content unreadably small; horizontal scroll available.
- Host GUI: compare a wide Mermaid note in Obsidian vs Lumière (font size and overflow-x); smoke image + wide table.

## Implementation notes

- Touch: `diagrams/renderer.ts`, `diagrams/diagrams.css`, embeds/tables CSS (and any width-clamp helpers found in audit).
- Unit tests: init config includes Obsidian `useMaxWidth` map; CSS regression test or snapshot that Mermaid SVG is not `max-width: 100%`.
- Host GUI after VSIX: wide flowchart fixture (user’s release diagram class of note) + existing mermaid lightbox shot if needed.
