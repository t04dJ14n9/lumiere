# Design: PDF sidecar highlights (Markdown overlay)

**Date:** 2026-11-01  
**Approved:** user via Lumière Projects (Asia/Shanghai / America/Los_Angeles, Oct 31–Nov 1 2026)  
**Amendments:** Copy link to this rename (was “Copy Link for Agent” → briefly “Copy Link” → **Copy link to this**); cite paragraph auto-highlight; bibliography list UI + jumps (scope A); **hard invariant — PDF never modified in sidecar mode** — user confirmed via Projects; **setting for sidecar storage location** (`lumiere.pdf.sidecar.location` / `.directory`; sibling vs workspace folder only) — user ask via Projects (pt11u)  
**Repo:** `t04dJ14n9/lumiere`  
**Package:** `packages/pdf` (`@workshop/pdf`), with Markdown link resolution for any `.md`  
**Risk:** Low for this docs PR; product/UI Medium when implemented  
**Ancestry:** supersedes the v1 *default* of `2026-10-30-pdf-annotations-direct-to-pdf-design.md` for **highlights**; re-adopts the 2026-10-10 feasibility preference for sidecar-first storage. #457/#464/#469 remain the create / status-bar / hit-test+Delete+Copy Link foundation (command/menu label **Copy link to this**, same clipboard payload; rename path: “Copy Link for Agent” → briefly “Copy Link” → **Copy link to this**).

## Goal

Make **sidecar Markdown** the default persistence for PDF **highlights** so the open PDF file stays clean. Marks live in a Markdown file beside the PDF, re-import as an EmbedPDF overlay on open, and are addressable from any note via `#hl-<id>` deep links. Notes and answers stay ordinary Markdown (LaTeX OK) and can cite those highlights.

For research PDFs, also surface **citations**: auto-highlight paragraphs that contain in-text references, expose a **bibliography / references list** UI, and let the user jump from in-text cites and from list entries to the matching bibliography location (same PDF) or to linked notes via existing `#hl-` / sidecar links.

## Non-goals (v1)

- Burning highlights into the PDF as the default save path (optional later export).
- Treating direct-to-PDF Annotate as a peer *default* mode (direct-to-PDF remains available for non-highlight tools that already write into the file; v1 highlight UX defaults to sidecar).
- W3C Web Annotation / JSON-LD interchange (export later).
- Full product rename Lumière → Lumia (separate plan; do not rename ids or display name in this work).
- XFDF import/export.
- MCP / agent **write** tools for highlights (**Copy link to this** stays clipboard/handoff only).
- A new note-graph or literature-manager product (linked notes only via existing `#hl-` / Markdown links already in the sidecar or vault).
- Changing status-bar Annotate chrome layout beyond wiring highlight commit → sidecar (references list may use a view/panel pattern; see [Citations and bibliography](#citations-and-bibliography)).

## Hard invariant (sidecar mode)

**In sidecar mode the PDF file on disk is never modified.** User highlights, cite-auto paragraph overlays, bibliography / references list UI, and jumps are overlay + sidecar (and in-memory models) only. No `saveAsCopy` / host overwrite of the open PDF for these features. Hash of the PDF before and after highlight create/update/delete, cite detection, and list interaction must be identical. Strip-before-write is a safety net for accidental EmbedPDF persistence, not a license to write the PDF. Direct-to-PDF Annotate for non-highlight burn-in tools remains a separate path outside this mode’s default.

## Decisions (locked)

| Topic | Decision |
|--------|----------|
| Default mode | **Sidecar Markdown** for highlights. **Hard invariant:** the PDF file is never modified in this mode (highlights / cites / refs list = overlay + sidecar only). |
| Sidecar path | **Default:** `paper.pdf.lumiere.md` next to `paper.pdf` (same directory, basename = PDF name + `.lumiere.md`). **Configurable** via `lumiere.pdf.sidecar.location` / `lumiere.pdf.sidecar.directory` (see [Sidecar storage location](#sidecar-storage-location)). No existing vault convention for annotation sidecars; sibling naming is the new convention. |
| Sidecar location setting | VS Code/Cursor settings under the Lumière PDF namespace (matches `package.json` `contributes.configuration` style `lumiere.pdf.*`): **`lumiere.pdf.sidecar.location`** (enum) and **`lumiere.pdf.sidecar.directory`** (string path). |
| Sidecar location policies (v1) | Exactly **two** modes: (1) **`sibling`** (default) — `paper.pdf.lumiere.md` beside the PDF; (2) **`directory`** — flat file in a user-picked **workspace folder** (path relative to the workspace root only; no absolute / outside-workspace paths), same basename `paper.pdf.lumiere.md`. Collision note when two PDFs share a basename (see section). |
| Sidecar discovery / migration | Resolve write/load path from the setting first; if the configured path is missing on open, **also check the sibling** `*.pdf.lumiere.md` so notes created under the old default are not orphaned. |
| Sidecar contents | (a) machine **highlight blocks** (stable `id`, page, `segmentRects`, quote + surrounding context); (b) optional human **notes/answers** as normal Markdown. |
| Format | Lumière-private Markdown blocks in v1 (not W3C JSON-LD). |
| On open | Load sidecar → `importAnnotations()` as **overlay only**. |
| On highlight commit | Intercept create/update/delete → append/update/remove the sidecar block; keep overlay in the viewer; **do not** persist those overlay annots into the PDF on save. |
| Save safety | Prove with tests that imported overlay annots are not written into the PDF; if EmbedPDF would persist them, strip by id before any `saveAsCopy` / host overwrite. Call out verification as a must-ship gate. |
| Deep links | Any `.md` may link: `[label](path/to/paper.pdf#hl-<id>)` → open PDF, scroll to that highlight, flash it. Keep today’s `#page=N&viewrect=…`. |
| Re-attach | Each highlight stores `segmentRects` **and** quote + surrounding context for re-attach when layout shifts (e.g. arXiv v2). |
| Delete / Copy link to this | Overlay marks keep #469 Delete and **Copy link to this** behaviour (rename path: “Copy Link for Agent” → briefly “Copy Link” → **Copy link to this**; same payload so any Markdown can paste it); writes go through the sidecar (delete removes the block; Copy link to this uses `#hl-<id>` when the selection is a sidecar highlight). |
| Answers | Notes/answers live in the sidecar or any note, linking via `#hl-…`. |
| Cite paragraphs | Detect common in-text cite marks → **auto-highlight the paragraph** (overlay, not burned into PDF; may be ephemeral session overlays and/or sidecar-tagged `source: cite-auto` — implementation plan picks persistence; product default is visible auto-highlight without dirtying the PDF). |
| Bibliography UI | PDF exposes a **references / bibliography list**; selecting an entry jumps to that bib location in the PDF when resolved. |
| Cite / list jumps | From an in-text cite **or** a list entry → jump to same-PDF bibliography when resolvable; linked notes only via existing `#hl-` / sidecar Markdown links (no new note graph). |
| Product name | Still **Lumière** in this repo for this PR. |

## Problem

Direct-to-PDF Annotate (#457+) is good for marks that should travel with the file in Preview/Acrobat, but research workflows want:

1. A PDF that stays pristine (shared originals, git-friendly binaries, publisher copies).
2. Highlights and reading notes that live in Markdown next to the paper, editable and linkable from the vault.
3. Stable URLs into a specific highlight from answers, literature notes, or agent handoffs.
4. Fast movement through a paper’s **citation structure**: see which paragraphs cite, open a bibliography list, and jump cite ↔ bib (and into notes that already link those highlights).

Sidecar-first was the 2026-10-10 feasibility default; direct-to-PDF superseded it for desktop Annotate v1. This design restores sidecar as the **default for highlights** without ripping out EmbedPDF Annotation / History / #469 UX, and adds citation navigation on top.

## Mode default

- Entering Annotate and using the **highlight** tool (and, in v1, sibling text-markup tools that are treated as “highlights” for storage: underline / strikeout / squiggly if they share the same commit path — **implementation may start with highlight-only** and extend markup subtypes without a new design) commits to the sidecar, not the PDF.
- Tools that still write into the PDF (ink, shapes, stamps, freeText, etc. under the existing direct-to-PDF design) keep today’s save-into-PDF pipeline unless a later cut moves them.
- A setting may expose “burn into PDF” later; it is out of v1.
- Cite auto-highlights are **not** user Annotate commits; they do not become ordinary sidecar highlight blocks unless the user explicitly promotes/saves one (optional follow-up; not required in v1).

## Sidecar storage location

Users can choose where sidecar Markdown files live via **exactly two modes**: beside the PDF (default) or a folder in the workspace. PDF bytes are never modified regardless of location (hard invariant).

### Settings (propose for `package.json` `contributes.configuration`)

Ids follow existing Lumière PDF naming (`lumiere.pdf.view.*`, `lumiere.pdf.toolbar.*`, `lumiere.pdf.agentBridge.enabled`, …):

| Id | Type | Default | Purpose |
|----|------|---------|---------|
| `lumiere.pdf.sidecar.location` | enum: `"sibling"` \| `"directory"` | `"sibling"` | Storage policy for highlight sidecars. |
| `lumiere.pdf.sidecar.directory` | `string` | `""` (empty) | Workspace-relative folder path used when `location` is `"directory"` (e.g. `notes/pdf-sidecars`). Must resolve under the workspace root — **no absolute paths, no `..` escape outside the workspace**. Ignored when `location` is `"sibling"`. |

UI copy (illustrative): **PDF: Sidecar location** / **PDF: Sidecar directory**. Scope: workspace-overridable (same as other `lumiere.pdf.*` settings).

### Exactly two modes (locked)

1. **Beside the PDF** (`location: "sibling"`, default) — current behaviour.
2. **Workspace folder** (`location: "directory"`) — user picks a folder path **inside the workspace**; sidecars are stored flat there.

No other policies in v1 (no absolute paths outside the workspace, no mirror-tree, no hashed names, no multi-root search paths).

### Path derivation (v1)

| Policy | Resolved sidecar path for workspace PDF `papers/attn/paper.pdf` |
|--------|------------------------------------------------------------------|
| `sibling` (default) | `papers/attn/paper.pdf.lumiere.md` (beside the PDF). |
| `directory` | `<workspace>/{sidecar.directory}/paper.pdf.lumiere.md` — **flat**, same basename only (no mirror of the PDF’s relative tree). |

Example for `directory`: `"notes/pdf-sidecars"` → `<workspace>/notes/pdf-sidecars/paper.pdf.lumiere.md`.

Validation when `location` is `"directory"`:

- `directory` must be a non-empty workspace-relative path that resolves under the workspace root (reject absolute paths, `~`, and `..` segments that escape the workspace).
- Empty, absolute, or escaping path → misconfiguration: toast once, **fall back to sibling** for that session (do not invent a hidden folder; do not write outside the workspace).

### Basename collisions (workspace folder)

Two different PDFs that share a basename (e.g. `a/paper.pdf` and `b/paper.pdf`) map to the **same** sidecar path under a flat custom directory. v1 behaviour:

- Prefer documenting the limitation over hashing or mirroring trees.
- On write conflict (existing sidecar’s front-matter `source` does not match this PDF’s identity — basename and, when available, a stored relative path or content hash hint): do **not** overwrite silently; toast and keep the existing file; user can rename the PDF or pick a different directory / switch to sibling.
- Front matter should continue to record `source: paper.pdf` (and implementation may add an optional relative path field later without a new design if needed for disambiguation).

Mirror-under-vault / hashed flat names are **out of v1** (possible follow-up if collisions bite).

### Resolve / discovery / migration

When opening a PDF:

1. Compute the **primary** path from `lumiere.pdf.sidecar.location` (+ `.directory` when applicable).
2. If that file exists → load it.
3. Else if primary ≠ sibling and a **sibling** `*.pdf.lumiere.md` exists → **load the sibling** (read-only migration discovery so old notes are not orphaned). First user edit that persists may either keep writing the sibling or offer to move/copy into the configured directory — implementation plan picks one; product default: **keep loading sibling until the user moves it**; new highlights for a PDF that had no sidecar yet write to the configured primary path.
4. Else → empty overlay (create primary path on first highlight commit).

Writes (create/update/delete of highlight blocks) always target the **primary** path when creating a new sidecar; when an existing sidecar was discovered only via sibling fallback, prefer continuing to update that discovered file until an explicit move (avoids duplicating notes). Document the exact “sticky discovered path vs always primary” choice in the implementation plan; both must preserve the hard invariant and never leave the user with two divergent sidecars without warning.

Deep links in notes (`paper.pdf#hl-…`) are unchanged: they address the PDF, not the sidecar path. Sidecar location does not affect `#hl-` resolution.

### Non-goals for this setting (v1)

- Absolute / outside-workspace sidecar directories.
- Per-PDF overrides.
- Multiple search directories / path globs.
- Mirror-relative-tree or hashed filenames.
- Automatic bulk migrate command (optional follow-up).
- Changing the `*.pdf.lumiere.md` filename pattern.

## Sidecar format

**Filename:** always `{pdfBasename}.lumiere.md` (e.g. URI `…/paper.pdf` → `paper.pdf.lumiere.md`).  
**Directory:** from [Sidecar storage location](#sidecar-storage-location) — default sibling next to the PDF; optional workspace folder via settings (exactly two modes).

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
  → resolve sidecar path from lumiere.pdf.sidecar.* (see Sidecar storage location)
  → if missing at configured path, fall back read of sibling paper.pdf.lumiere.md (migration)
  → missing both = empty overlay
  → parse highlight blocks
  → importAnnotations(items) as overlay (tag custom.source = "sidecar")
  → run cite detection → paragraph auto-highlight overlays (tag custom.source = "cite-auto")
  → build bibliography list model from detected bib block + cite keys
  → viewer shows marks; PDF disk bytes unchanged

User creates/updates/deletes a highlight (Annotate commit)
  → update in-memory overlay
  → write sidecar (create file if needed; atomic write)
  → do NOT run saveAsCopy into paper.pdf for that change

Any host save / saveAsCopy path that still runs for other tools
  → strip annotations with custom.source in {"sidecar", "cite-auto"} (or id set) before serialize
  → tests must fail the build if a sidecar / cite-auto id appears in rewritten PDF bytes
```

**Must-verify:** EmbedPDF `importAnnotations` + later `commit` / `saveAsCopy` behaviour for overlay-only items. If the engine would embed them, the host strips by id before writing the PDF. Document the chosen API (`purge` vs strip-on-save) in the implementation plan after a spike; the product rule does not change.

## Link resolution

| Fragment | Behaviour |
|----------|-----------|
| `#hl-<id>` | Open (or focus) the PDF custom editor; scroll so the highlight’s first rect is visible; flash the mark briefly. Missing id → toast; still open the PDF if possible. |
| `#page=N&viewrect=…` | Unchanged (today’s path). |
| Both | If a link somehow combines them, `#hl-` wins for scroll target; page/viewrect ignored. |

Resolution runs for links in **any** Markdown note in the workspace, not only the sidecar. Markdown package / host link handler must recognize `.pdf#hl-…` the same way it already handles `.pdf#page=`.

**Copy link to this** on a selected sidecar highlight copies:

`[basename · p.N](path#hl-<id>)` plus an optional `>` quote line when quote text is available — same handoff shape as #469 (label **Copy link to this**; rename path: “Copy Link for Agent” → briefly “Copy Link” → **Copy link to this**), with `#hl-` instead of `#page=&viewrect=` when the selection is a sidecar highlight. Text/region selection without a highlight still uses `#page=&viewrect=`. Any Markdown note can paste the link.

## Re-attach

On open (and optionally on sidecar reload):

1. Place overlay using stored `segmentRects` when the page geometry still matches (hash or simple bounds check).
2. If placement looks wrong or a “re-attach” pass is requested: search page text for `quote` near `contextBefore`/`contextAfter`; update `segmentRects` when a unique match is found; rewrite the sidecar block’s rects (and `modified`).
3. If no unique match: keep last rects, mark the highlight visually as stale (implementation detail), do not invent a second id.

## Copy link to this and Delete

- **Delete** (key or menu, Annotate mode): remove overlay annotation and delete/update the sidecar block; do not rewrite the PDF for that deletion. Does not apply to ephemeral `cite-auto` overlays unless the user has promoted them (v1: cite-auto is not deletable as a sidecar highlight).
- **Copy link to this:** as above (`#hl-<id>` for sidecar highlights). Same clipboard payload as today’s agent handoff; the UI string is **Copy link to this** (not Chrome’s “Copy link to highlight”; not “Copy Link”).
- Parity with #469 hit-test rules: AnnotationLayer pointer events only in Annotate mode for user marks.

## Citations and bibliography

**Scope A (locked):** full v1 citation navigation without a new note graph.

### Detection

- Scan extracted page text for common in-text cite marks, at least: `[12]`, `[3,4]`, `(Author, 2020)`, `(Author et al., 2020)`, and numeric superscripts when the text layer exposes them reliably.
- A **paragraph** that contains one or more such marks gets an auto-highlight overlay covering that paragraph’s bounds (derived from text rects). Visual style must be distinct from user sidecar highlights (e.g. lower opacity or different tint).
- Build a **bibliography model**: locate the References / Bibliography section (heading heuristics + last-pages fallback); parse entries and keys (numeric labels and author-year strings) best-effort.

### References list UI

- Expose a **bibliography / references list** for the open PDF (tree/view or side panel — match existing PDF Outline / host view patterns in the implementation plan; status-bar-only is not required for this list).
- Each row shows a short entry label; activating a row **jumps** to that bibliography entry’s location in the PDF (scroll + brief flash) when resolved.
- Unresolved entries remain listed but jump no-ops with a quiet toast.

### Jumps

| From | To |
|------|-----|
| In-text cite (click/activate within an auto-highlighted paragraph, or a cite chip if implemented) | Matching bibliography entry in the same PDF when the key resolves. |
| Bibliography list entry | Same-PDF bib location when resolved. |
| Linked notes | Only via existing Markdown `#hl-…` (or `#page=` / `viewrect`) links already present in the sidecar or other notes — **no** automatic note discovery or new graph edges in v1. |

When a cite key does not resolve, keep the paragraph highlight; jump fails softly.

### Persistence and PDF safety

- Cite-auto overlays and the bibliography model are derived from the PDF text; they **must not** rewrite PDF bytes.
- Strip `cite-auto` (and sidecar) ids before any `saveAsCopy` path, same gate as user sidecar highlights.
- Optional cache of detection results in extension storage is fine; do not require writing cite-auto blocks into the sidecar in v1.

## Testing

- **Unit:** sidecar path derivation for `sibling` and `directory` (workspace-relative only); reject absolute/`..` escape; empty-directory fallback to sibling; sibling migration discovery when primary missing; basename collision / mismatched `source` guard; parse/serialize round-trip of highlight blocks; id ↔ `#hl-` fragment; strip-by-id before save (fixture PDF bytes must not gain `/Subtype /Highlight` for sidecar or cite-auto ids); re-attach match / no-match; link parser for `#hl-` vs `#page=`; cite-mark detector fixtures (`[12]`, author-year); bib section heuristics; jump target resolution hit/miss; Copy link to this label/payload (no “for Agent” / no bare “Copy Link” in user-facing copy for this command).
- **Browser:** create highlight → sidecar file appears at configured path with block → reopen PDF → overlay visible → Delete removes block → `#hl-` navigation flashes mark; with `directory` set, new sidecar lands in that folder; with only a sibling leftover after switching to `directory`, reopen still loads notes; open a paper with cites → paragraph auto-highlights appear; references list populates; jump cite→bib and list→bib; PDF hash unchanged after cite detection.
- **Host GUI:** same create/reopen/delete; open a note with `[…](paper.pdf#hl-…)` and confirm jump+flash; references list visible and jumpable; screenshots in the impl PR (highlights + list + cite paragraph).
- **Save-safety gate:** automated test that after import + cite-auto + forced save path, original PDF hash equals post-save hash for sidecar/cite-only sessions.

## Risks

| Risk | Mitigation |
|------|------------|
| EmbedPDF persists imported annots into `saveAsCopy` | Strip-by-id / purge before write; blocking test. |
| Sidecar merge conflicts in git | Markdown is merge-friendly; keep one block per highlight; avoid rewriting unrelated prose. |
| Layout shift (new PDF version) | Quote + context re-attach; stale styling when unmatched. |
| Confusion with direct-to-PDF marks already in file | On open, PDF-native annots still show from the file; sidecar overlays are additive and tagged; do not convert existing embedded highlights automatically in v1. |
| Filename collision (sibling) | `.pdf.lumiere.md` is distinctive; document in README. |
| Basename collision (custom directory) | Flat v1 + mismatched-`source` guard; document limitation; no silent overwrite. |
| Orphaned sidecars after changing setting | On open, fall back read sibling when primary missing; sticky discovered path until move. |
| Empty / absolute / escaping `sidecar.directory` | Fall back to sibling + toast; never write outside the workspace; do not invent a folder. |
| Cite/bib false positives or missed styles | Start with common numeric + author-year patterns; soft-fail jumps; tune with fixtures from real arXiv/ACM PDFs. |
| Auto-highlight visual noise | Distinct style from user highlights; allow hide/toggle in impl plan if Host GUI shows clutter. |

## Migration from PDF-embedded Annotate

- Existing PDFs with embedded annotations continue to display them from the file.
- New **highlight** commits go to the sidecar by default; they do not remove embedded marks.
- No automatic “extract embedded → sidecar” in v1 (optional follow-up command).
- Docs / CAPABILITIES: state that highlight default is sidecar; link this spec; leave direct-to-PDF design as the reference for burn-in tools still on that path.
- Sidecar **location** setting defaults to sibling (same as today’s convention); changing to a custom directory does not auto-move existing sibling files — discovery fallback keeps them readable (see [Sidecar storage location](#sidecar-storage-location)).
- User-facing string **Copy link to this** for this handoff (rename path: “Copy Link for Agent” → briefly “Copy Link” → **Copy link to this**; payload unchanged). Broader rename of every historical doc string is not required in the impl PR beyond product UI + this design’s wording.

## Related work (non-goals here)

- Lumia full rename (ids + prefixes) — separate plan.
- Startup optimization — paused behind this and rename.
- W3C Web Annotation export.
- Burn-into-PDF / Export Annotated Copy.
- Literature note graph / Zotero-style library sync.

## Success criteria

- Highlight create/update/delete never changes PDF bytes when only sidecar highlights (and cite-auto overlays) are involved (hash proof).
- Sidecar exists at the configured location as `*.pdf.lumiere.md` with parseable blocks after the first user highlight (default: sibling next to the PDF).
- Reopen restores overlay from sidecar without user action.
- `lumiere.pdf.sidecar.location` / `.directory` control where new sidecars are written; sibling fallback finds pre-setting notes.
- `#hl-<id>` from any Markdown note opens the PDF, scrolls, and flashes.
- Delete and **Copy link to this** work on overlay marks and update/read the sidecar.
- Paragraphs with detected in-text cites show auto-highlights; references list is available; jumps work from cites and from list entries to same-PDF bib when resolved.
- Linked notes remain ordinary Markdown `#hl-` / page links only.
- No placeholder gaps left in this document; implementation plan is the next step after this spec is squash-merged.

## Open questions

None for v1 — decisions above are locked (including citation scope A and sidecar location settings). Implementation may choose highlight-only vs all text-markup subtypes in the first slice, the exact references-list host view, and sticky-discovered vs always-primary write after sibling migration fallback, without a new design pass, as long as the sidecar schema, location settings, save-safety rules, Copy link to this rename, and citation behaviours above hold.
