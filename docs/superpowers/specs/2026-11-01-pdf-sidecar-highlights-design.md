# Design: PDF sidecar highlights (Markdown overlay)

**Date:** 2026-11-01  
**Approved:** user via Lumière Projects (Asia/Shanghai / America/Los_Angeles, Oct 31–Nov 1 2026)  
**Repo:** `t04dJ14n9/lumiere`  
**Package:** `packages/pdf` (`@workshop/pdf`), with Markdown link resolution for any `.md`  
**Risk:** Low for this docs PR; product/UI Medium when implemented  
**Ancestry:** supersedes the v1 *default* of `2026-10-30-pdf-annotations-direct-to-pdf-design.md` for **highlights**; re-adopts the 2026-10-10 feasibility preference for sidecar-first storage. #457/#464/#469 remain the create / status-bar / hit-test+Delete+Copy Link foundation.

## Goal

Make **sidecar Markdown** the default persistence for PDF **highlights** so the open PDF file stays clean. Marks live in a Markdown file beside the PDF, re-import as an EmbedPDF overlay on open, and are addressable from any note via `#hl-<id>` deep links. Notes and answers stay ordinary Markdown (LaTeX OK) and can cite those highlights.

## Non-goals (v1)

- Burning highlights into the PDF as the default save path (optional later export).
- Treating direct-to-PDF Annotate as a peer *default* mode (direct-to-PDF remains available for non-highlight tools that already write into the file; v1 highlight UX defaults to sidecar).
- W3C Web Annotation / JSON-LD interchange (export later).
- Full product rename Lumière → Lumia (separate plan; do not rename ids or display name in this work).
- XFDF import/export.
- MCP / agent **write** tools for highlights (Copy Link for Agent stays clipboard/handoff only).
- Changing status-bar Annotate chrome layout beyond wiring highlight commit → sidecar.

## Decisions (locked)

| Topic | Decision |
|--------|----------|
| Default mode | **Sidecar Markdown** for highlights. The PDF bytes stay unchanged for highlight create/update/delete. |
| Sidecar path | `paper.pdf.lumiere.md` next to `paper.pdf` (same directory, basename = PDF name + `.lumiere.md`). No existing vault convention for annotation sidecars; this is the new convention. |
| Sidecar contents | (a) machine **highlight blocks** (stable `id`, page, `segmentRects`, quote + surrounding context); (b) optional human **notes/answers** as normal Markdown. |
| Format | Lumière-private Markdown blocks in v1 (not W3C JSON-LD). |
| On open | Load sidecar → `importAnnotations()` as **overlay only**. |
| On highlight commit | Intercept create/update/delete → append/update/remove the sidecar block; keep overlay in the viewer; **do not** persist those overlay annots into the PDF on save. |
| Save safety | Prove with tests that imported overlay annots are not written into the PDF; if EmbedPDF would persist them, strip by id before any `saveAsCopy` / host overwrite. Call out verification as a must-ship gate. |
| Deep links | Any `.md` may link: `[label](path/to/paper.pdf#hl-<id>)` → open PDF, scroll to that highlight, flash it. Keep today’s `#page=N&viewrect=…`. |
| Re-attach | Each highlight stores `segmentRects` **and** quote + surrounding context for re-attach when layout shifts (e.g. arXiv v2). |
| Delete / Copy Link | Overlay marks keep #469 Delete and Copy Link for Agent behaviour; writes go through the sidecar (delete removes the block; Copy Link uses `#hl-<id>` when the selection is a sidecar highlight). |
| Answers | Notes/answers live in the sidecar or any note, linking via `#hl-…`. |
| Product name | Still **Lumière** in this repo for this PR. |

## Problem

Direct-to-PDF Annotate (#457+) is good for marks that should travel with the file in Preview/Acrobat, but research workflows want:

1. A PDF that stays pristine (shared originals, git-friendly binaries, publisher copies).
2. Highlights and reading notes that live in Markdown next to the paper, editable and linkable from the vault.
3. Stable URLs into a specific highlight from answers, literature notes, or agent handoffs.

Sidecar-first was the 2026-10-10 feasibility default; direct-to-PDF superseded it for desktop Annotate v1. This design restores sidecar as the **default for highlights** without ripping out EmbedPDF Annotation / History / #469 UX.

## Mode default

- Entering Annotate and using the **highlight** tool (and, in v1, sibling text-markup tools that are treated as “highlights” for storage: underline / strikeout / squiggly if they share the same commit path — **implementation may start with highlight-only** and extend markup subtypes without a new design) commits to the sidecar, not the PDF.
- Tools that still write into the PDF (ink, shapes, stamps, freeText, etc. under the existing direct-to-PDF design) keep today’s save-into-PDF pipeline unless a later cut moves them.
- A setting may expose “burn into PDF” later; it is out of v1.

## Sidecar format

Path: for URI `…/paper.pdf`, sidecar is `…/paper.pdf.lumiere.md`.

Suggested structure (illustrative; field names are normative for v1):

````markdown
---
lumiere-pdf-sidecar: 1
source: paper.pdf
---

<!-- lumiere-highlight
id: hl-a1b2c3d4
page: 3
subtype: highlight
color: "#FFE566"
opacity: 0.45
segmentRects:
  - { x: 72, y: 410, w: 220, h: 12 }
  - { x: 72, y: 424, w: 180, h: 12 }
quote: "scaled dot-product attention"
contextBefore: "We propose "
contextAfter: " as the core of the Transformer."
created: 2026-11-01T18:00:00Z
modified: 2026-11-01T18:00:00Z
-->

## Notes

See [attention definition](paper.pdf#hl-a1b2c3d4).

The residual stream still carries the pre-attention representation.
````

Rules:

- Front matter declares `lumiere-pdf-sidecar: 1` and the relative `source` PDF basename.
- Each highlight is an HTML comment block starting with `lumiere-highlight` so the file remains valid Markdown humans can edit around.
- `id` is stable, opaque, URL-safe; deep link fragment is `#hl-<id>` (the `hl-` prefix is part of the fragment; the stored id may either include the prefix or omit it — **normative:** fragment is always `#hl-` + the `id` field value when `id` has no `hl-` prefix; if `id` already starts with `hl-`, do not double the prefix). Prefer generating ids that already include the `hl-` prefix so fragment and field match literally (`id: hl-a1b2c3d4` → `#hl-a1b2c3d4`).
- `segmentRects` use the same page-space convention as EmbedPDF / existing `viewrect` (document in the implementation plan; match `packages/pdf` selection geometry).
- `quote` + `contextBefore` / `contextAfter` are required for new highlights so re-attach can recover after layout change.
- Human prose outside comment blocks is free-form Markdown.

## Open / import / save pipeline

```
Open paper.pdf
  → resolve sibling paper.pdf.lumiere.md (missing = empty overlay)
  → parse highlight blocks
  → importAnnotations(items) as overlay (tag custom.source = "sidecar")
  → viewer shows marks; PDF disk bytes unchanged

User creates/updates/deletes a highlight (Annotate commit)
  → update in-memory overlay
  → write sidecar (create file if needed; atomic write)
  → do NOT run saveAsCopy into paper.pdf for that change

Any host save / saveAsCopy path that still runs for other tools
  → strip annotations with custom.source = "sidecar" (or id set) before serialize
  → tests must fail the build if a sidecar id appears in rewritten PDF bytes
```

**Must-verify:** EmbedPDF `importAnnotations` + later `commit` / `saveAsCopy` behaviour for overlay-only items. If the engine would embed them, the host strips by id before writing the PDF. Document the chosen API (`purge` vs strip-on-save) in the implementation plan after a spike; the product rule does not change.

## Link resolution

| Fragment | Behaviour |
|----------|-----------|
| `#hl-<id>` | Open (or focus) the PDF custom editor; scroll so the highlight’s first rect is visible; flash the mark briefly. Missing id → toast; still open the PDF if possible. |
| `#page=N&viewrect=…` | Unchanged (today’s path). |
| Both | If a link somehow combines them, `#hl-` wins for scroll target; page/viewrect ignored. |

Resolution runs for links in **any** Markdown note in the workspace, not only the sidecar. Markdown package / host link handler must recognize `.pdf#hl-…` the same way it already handles `.pdf#page=`.

Copy Link for Agent on a selected sidecar highlight copies:

`[basename · p.N](path#hl-<id>)` plus an optional `>` quote line when quote text is available — same handoff shape as #469, with `#hl-` instead of `#page=&viewrect=` when the selection is a sidecar highlight. Text/region selection without a highlight still uses `#page=&viewrect=`.

## Re-attach

On open (and optionally on sidecar reload):

1. Place overlay using stored `segmentRects` when the page geometry still matches (hash or simple bounds check).
2. If placement looks wrong or a “re-attach” pass is requested: search page text for `quote` near `contextBefore`/`contextAfter`; update `segmentRects` when a unique match is found; rewrite the sidecar block’s rects (and `modified`).
3. If no unique match: keep last rects, mark the highlight visually as stale (implementation detail), do not invent a second id.

## Agent Copy Link and Delete

- **Delete** (key or menu, Annotate mode): remove overlay annotation and delete/update the sidecar block; do not rewrite the PDF for that deletion.
- **Copy Link for Agent:** as above (`#hl-<id>` for sidecar highlights).
- Parity with #469 hit-test rules: AnnotationLayer pointer events only in Annotate mode.

## Testing

- **Unit:** sidecar path derivation; parse/serialize round-trip of highlight blocks; id ↔ `#hl-` fragment; strip-by-id before save (fixture PDF bytes must not gain `/Subtype /Highlight` for sidecar ids); re-attach match / no-match; link parser for `#hl-` vs `#page=`.
- **Browser:** create highlight → sidecar file appears with block → reopen PDF → overlay visible → Delete removes block → `#hl-` navigation flashes mark.
- **Host GUI:** same create/reopen/delete; open a note with `[…](paper.pdf#hl-…)` and confirm jump+flash; prove PDF file hash unchanged across highlight edits; screenshots in the impl PR.
- **Save-safety gate:** automated test that after import + forced save path, original PDF hash equals post-save hash for sidecar-only sessions.

## Risks

| Risk | Mitigation |
|------|------------|
| EmbedPDF persists imported annots into `saveAsCopy` | Strip-by-id / purge before write; blocking test. |
| Sidecar merge conflicts in git | Markdown is merge-friendly; keep one block per highlight; avoid rewriting unrelated prose. |
| Layout shift (new PDF version) | Quote + context re-attach; stale styling when unmatched. |
| Confusion with direct-to-PDF marks already in file | On open, PDF-native annots still show from the file; sidecar overlays are additive and tagged; do not convert existing embedded highlights automatically in v1. |
| Filename collision | `.pdf.lumiere.md` is distinctive; document in README. |

## Migration from PDF-embedded Annotate

- Existing PDFs with embedded annotations continue to display them from the file.
- New **highlight** commits go to the sidecar by default; they do not remove embedded marks.
- No automatic “extract embedded → sidecar” in v1 (optional follow-up command).
- Docs / CAPABILITIES: state that highlight default is sidecar; link this spec; leave direct-to-PDF design as the reference for burn-in tools still on that path.

## Related work (non-goals here)

- Lumia full rename (ids + prefixes) — separate plan.
- Startup optimization — paused behind this and rename.
- W3C Web Annotation export.
- Burn-into-PDF / Export Annotated Copy.

## Success criteria

- Highlight create/update/delete never changes PDF bytes when only sidecar highlights are involved (hash proof).
- Sidecar exists at `*.pdf.lumiere.md` with parseable blocks after the first highlight.
- Reopen restores overlay from sidecar without user action.
- `#hl-<id>` from any Markdown note opens the PDF, scrolls, and flashes.
- Delete and Copy Link for Agent work on overlay marks and update/read the sidecar.
- No TBD left in this document; implementation plan is the next step after this spec is squash-merged.

## Open questions

None for v1 — decisions above are locked. Implementation may choose highlight-only vs all text-markup subtypes in the first slice without a new design pass, as long as the sidecar schema and save-safety rules hold.
