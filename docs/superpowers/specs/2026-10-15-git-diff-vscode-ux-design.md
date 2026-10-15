# Git diff viewer UX (borrow VS Code, keep our stack)

Date: 2026-10-15  
Status: revised after ChatGPT High REQUEST CHANGES  
Repo: vscode-markdown-workbench  
Branch: `docs/git-diff-vscode-ux`

## Review provenance

Revised to address blockers **B1–B6** from ChatGPT High critique:

- Chat: [Critique Git UX Design](https://chatgpt.com/g/g-p-6ad0841322fc81919438032f917cf8e8-markdown-workshop/c/6ad0beea-a44c-83ea-95ad-ac069f24867c)
- Local review record: `/workspace/plans/chatgpt-git-diff-ux/ANSWER.md` (verdict: REQUEST CHANGES)
- User approved revising this design with those fixes (2026-10-15). Locked product decisions below are unchanged.

## Goal

Keep Markdown Workshop’s own git diff surfaces (`gitGutter`, `gitInline`, `gitDiffEditor`). Borrow good VS Code interactions and chrome ideas; do **not** port or fork VS Code’s DiffEditor / Monaco source.

## Decisions (user, locked)

- Keep our own diff viewer; no VS Code DiffEditor source port.
- Borrow UX: click opens diff; **added** lines open diff; caret moves.
- Raw text in hunk body; Live Preview stays rendered.
- Shared language across `gitGutter` / `gitInline` / `gitDiffEditor` (data model, navigation vocabulary, actions, visual tokens — **not** identical rendering architecture).
- Not pixel-faithful to VS Code; inspired UX only.
- May reference microsoft/vscode for layout/token ideas; no wholesale source copy.

Clarification (from review §4): **Custom git surfaces** share one hunk model, navigation vocabulary, actions, and visual tokens. `diffEditor=native` intentionally bypasses custom presentation and is an escape hatch, not a peer of the shared chrome.

---

## B1 — Semantic `DiffHunk` model (shared contract)

Replace the presentation-first open call `{ uri, range, changeIndex, total, compareTo }` with a semantic hunk first. Every surface (`gitGutter`, peek, `gitInline`, custom `gitDiffEditor`) **consumes the same `DiffHunk` / `HunkRef`**.

### `DiffSnapshot` (generation)

| Field | Purpose |
|---|---|
| `generationId` | Immutable id for this compute pass |
| `repository` | Explicit repository root / identity |
| `base` | Comparison base (see B2) |
| `target` | Comparison target (see B2) |
| `modifiedUri` | Current document URI |
| `originalUri` | Base-side URI when different (optional) |
| `hunks` | Ordered `DiffHunk[]` for this file + comparison |
| `computedAt` | Wall time / document version stamp used for stale checks |

`N of M` is **derived** from the current snapshot’s hunk list for the same file + comparison. It is never stored as hunk identity.

### `DiffHunk`

| Field | Purpose |
|---|---|
| `hunkId` | Stable fingerprint within a snapshot (content + ranges + comparison) |
| `generationId` | Must match owning snapshot |
| `originalRange` | Base-side line range (may be zero-length for pure inserts) |
| `modifiedRange` | Current-side line range (may be zero-length for pure deletes) |
| `modifiedAnchor` | Zero-width position in the current document (see B4) |
| `lines` | Ordered line records: `{ kind: 'context' \| 'add' \| 'delete', originalLine?: number, modifiedLine?: number, text: string }` |
| `capabilities` | `{ canStage, canUnstage, canRevert, … }` from the Git layer for this comparison |

Rules:

- One shared hunk computation feeds gutter decorations **and** peek/open. Whitespace / algorithm settings must not diverge between bar and opened hunk.
- Open API shape (conceptual): `openHunk(ref: HunkRef)` where `HunkRef` is `{ generationId, hunkId }` (or equivalent). Surfaces resolve through the current snapshot; they do not pass raw `range` + `changeIndex` as identity.
- After edit/stage/revert, recompute snapshot; rematch by fingerprint / nearest surviving hunk (see B3).

---

## B2 — Explicit base / target and action matrix

Replace vague `compareTo` (e.g. “working tree vs HEAD/index”) with an explicit pair:

- `base`: `HEAD` | `INDEX` | `revision` | `empty`
- `target`: `INDEX` | `WORKTREE` | `revision`
- `repository`: always explicit

Actions are **capability-driven** from the Git layer for that pair. Shared chrome must not infer Stage / Revert / Unstage from colors or string labels.

| Comparison | Typical mutations (v1) |
|---|---|
| `INDEX → WORKTREE` | Stage, Revert (working changes) |
| `HEAD → INDEX` | Unstage |
| `revision → revision` | Read-only |
| `HEAD → WORKTREE` | Prefer read-only unless staged/unstaged can be safely partitioned |
| `empty → untracked` | Stage; destructive discard is a **separate** path (may delete the file) — not “revert lines” |

Notes:

- Revert (discard working changes) ≠ Unstage. Do not conflate them in labels or handlers.
- Untracked pure-addition “hunk”: Stage is allowed when capable; discard uses an explicit discard/delete affordance, not Revert-as-line-restore.

---

## B3 — Stale-generation invalidation

Every displayed hunk belongs to a `generationId`. Destructive or mutating actions never run against a stale hunk.

While peek (or inline-open) is open, any of these invalidate the snapshot:

- document edits (including autosave-driven buffer changes);
- another editor modifying the same URI;
- Git index / HEAD / worktree changes (stage, unstage, commit, external git);
- our own Stage / Revert / Unstage completing.

### Policy (v1)

1. On document or Git-state change → recompute snapshot.
2. If the open hunk’s fingerprint still matches → keep it; refresh `N of M` and line records.
3. Else select the nearest surviving hunk (same file + comparison).
4. If no corresponding change remains → close the peek.
5. **Before** Stage / Revert / Unstage: validate `generationId`; if stale, refresh/re-resolve; execute only against the refreshed hunk; if unresolved, abort and do not mutate.
6. **Dirty unsaved documents:** if the preview is from the in-memory `TextDocument` but the Git action would apply against disk/index, disable destructive buttons unless the existing Git layer can safely reconcile that exact buffer version. Prefer disable over wrong-target mutation.

Initial Stage/Revert wiring may ship disabled until generation validation is in place (see build order).

---

## B4 — `modifiedAnchor` and focus policy

There is one keyboard focus owner at a time. Every hunk has a `modifiedAnchor` in the current document:

- **Add / modify:** anchor at the corresponding modified line (prefer the **clicked** line when opening from a multi-line hunk; prev/next may use hunk start).
- **Delete:** anchor at the zero-width deletion boundary on the modified side; clamp correctly at BOF/EOF.

### Focus / caret rules

| Action | Live Preview caret | Keyboard focus |
|---|---|---|
| Open via gutter (or collapsed inline click) | Move to `modifiedAnchor` (clicked line when applicable) | Remains in Live Preview |
| Explicit click / Tab / F6 into peek body | Unchanged unless user navigates | Transfers to peek |
| Prev / next | Update to that hunk’s anchor (hunk start) | Retain whichever surface currently owns focus |
| Escape / close | Move to **currently displayed** hunk’s `modifiedAnchor` | Focus Live Preview |

Do not claim “focus moves into the peek” on mere open. Peek body focus is opt-in.

---

## B5 — `gitInline` click precedence

When `gitInline` decorations are on, opening the shared hunk must not turn changed Markdown into a giant button or steal interactive Live Preview behavior.

Precedence (highest first):

1. Drag / text selection wins (no open-hunk on selection drag).
2. Interactive Markdown controls keep their normal action (links, wikilinks, checkboxes, table controls, etc.).
3. A collapsed ordinary click may set the caret **and** open the hunk via the same `openHunk` as gutter.
4. The diff handler must not `preventDefault` normal caret placement unnecessarily.
5. Where interaction would be ambiguous, provide a dedicated change affordance / hit area (e.g. margin glyph or explicit “Show Diff” control) rather than consuming the whole highlight.

`gitInline` is a thin adapter to `openHunk`, not a second UI.

---

## B6 — Unified raw peek (not mini side-by-side)

Decide the peek visual model explicitly:

- **Peek / hunk detail = always raw unified view** with two line-number columns (`old` | `new`), not a miniature side-by-side editor.

```text
old new
 12  12   context
 13       deleted text
     13   added text
     14   added text
 14  15   context
```

- Pure additions: empty `old` column, green `new` lines as raw text.
- Pure deletions: red `old` lines, empty `new` column; caret uses delete `modifiedAnchor`.
- Full-file `native` = existing native VS Code escape hatch (bypasses custom chrome).
- Full-file `rendered` = existing rendered Markdown compare.
- Shared language = data / chrome / navigation / tokens — **not** identical full-file rendering architecture.

Optional later: `\ No newline at end of file` indicator for terminal-newline-only diffs.

---

## Surfaces

### `gitGutter` (default on)

- Change bars: added / modified / deleted (existing).
- Click bar **or** “Show Git Change” resolves the bar’s hunk from the current snapshot and calls `openHunk`.
- **Added** hunks open the same raw unified peek (requirement; today’s weaker add path must be fixed).
- Peek header: file label, explicit base→target label, derived `N of M` (file-local + comparison-local, wraparound), capability-gated Stage / Unstage / Revert, prev / next / close, and **Open Full Diff** (non-blocking suggestion folded into v1 peek chrome).
- Opening follows B4 (caret to anchor; focus stays in Live Preview unless user enters peek).

### `gitInline` (default off)

- Word/line decorations remain optional; do not force default-on.
- Clicks follow B5 precedence and call the same `openHunk`.
- Intraline / word highlight is secondary overlay; line background remains the structural cue.

### `gitDiffEditor`

- SCM / Timeline / “Open Rendered Git Diff” keep our editor for custom modes.
- Prefer the same hunk model and navigation vocabulary; align title/actions styling with peek where practical.
- Preserve `diffEditor` setting `native` | `rendered`; **do not remove** `native`.
- Stage/Revert in peek header is intentional hunk-level UX for v1 (not claiming parity with VS Code’s per-line diff-gutter actions).

---

## Shared module

Name TBD (e.g. `gitShared` or `shared/git-diff-chrome`). Responsibilities:

1. Snapshot / hunk computation (single source for gutter + peek + inline).
2. `openHunk` / prev / next / close against current generation.
3. Capability-gated action dispatch with stale checks.
4. Theme tokens mapped to host when available — prefer real VS Code token names where they exist, e.g. `diffEditor.insertedLineBackground`, `diffEditor.removedLineBackground`, `editorGutter.addedBackground`, `editorGutter.modifiedBackground`, `editorGutter.deletedBackground`, `peekView.*`. Prefer non-opaque diff backgrounds so underlying decorations remain visible.
5. Unified raw peek widget (B6).

### Explicit non-goals (v1)

- Pixel-perfect VS Code chrome.
- Copying monaco-editor / vscode `diffEditor` TypeScript into the extension.
- Replacing CodeMirror with Monaco.
- Claiming full-file layout auto-switch parity with VS Code side-by-side ↔ inline width behavior.
- Per-line Stage/Revert in the full diff gutter (hunk-level only for v1).

---

## Interaction summary

1. Click gutter mark (add/modify/delete) → resolve hunk from current snapshot → open raw unified peek; Live Preview caret → `modifiedAnchor` (clicked line); focus stays in Live Preview; header shows derived `N of M`.
2. Prev/next cycle file-local + comparison-local hunks with wraparound; update caret per B4; retain focus owner.
3. Stage / Unstage / Revert only when `capabilities` allow **and** generation validates (B2, B3).
4. Escape / close → focus Live Preview at currently displayed hunk’s `modifiedAnchor`.
5. Open Full Diff from peek when the user needs the full-file surface.
6. Inline collapsed click → same `openHunk`, subject to B5 precedence.

---

## Accessibility (minimum for v1)

- Raw unified hunk exposes sensible line semantics (added / removed / context) to assistive tech.
- All peek header actions are keyboard reachable.
- Explicit keyboard entry into the hunk body (Tab / F6 or documented command); next/previous hunk commands usable without the mouse.
- Aria labels may borrow VS Code wording ideas; do not require Accessible Diff Viewer feature parity in v1.

---

## Build order

1. **Shared semantic hunk layer** — repository, base/target, original + modified ranges, `modifiedAnchor`, immutable `generationId`, line records, capabilities. No chrome yet.
2. **`gitGutter` → raw unified peek** — pure adds, pure deletes, prev/next, deterministic focus restoration, stale refresh; Stage/Revert disabled until generation validation works, then enable per matrix.
3. **`gitInline` thin adapter** to the same `openHunk` with B5 precedence.
4. **`gitDiffEditor` chrome / navigation alignment** last.

This tests the hard state model once instead of three visually consistent surfaces on an ambiguous contract.

---

## Implementation notes

- Prefer restyle + shared API over new editor architecture.
- Reference VS Code for measurements, aria label ideas, and **actual** theme token names (not merely similar colors).
- Preserve horizontal scroll and copy for long Markdown lines (URLs, tables, frontmatter).
- Responsive peek header: on narrow editors keep close + prev/next visible; overflow Stage / Revert / Open Full Diff into `…`.
- Tests: gutter click on added line opens peek; modified/deleted unchanged; caret = `modifiedAnchor` / clicked line; stale generation blocks mutation; no regressions on stage/revert when enabled; inline click does not steal link/checkbox/selection.
- Ship behind existing plugin toggles; no forced enable of `gitInline`.

---

## Out of scope / later

- Full SCM multi-file session UI.
- Exact VS Code overview-ruler pixel layout (overview-ruler marks optional follow-up).
- Making `gitInline` default-on.
- Preference mirroring `scm.diffDecorationsGutterAction` (gutter click → diff vs nothing); default remains click → diff.
- `\ No newline at end of file` indicator (nice-to-have after unified peek ships).
- Word-level highlight tuning beyond “secondary overlay”.
- VS Code Accessible Diff Viewer full parity.
- Per-line / selection Stage-Revert in full diff gutter.

---

## Approval history

1. User approved direction in chat (2026-10-15): keep own viewer; borrow UX (click → diff; added lines open diff); raw text inside hunk; Live Preview stays rendered; shared language across three surfaces.
2. ChatGPT High REQUEST CHANGES (same date): blockers B1–B6 — see review provenance.
3. User approved revising this design with ChatGPT’s fixes (same date). This document is that revision.
