# Git diff viewer UX (borrow VS Code, keep our stack)

Date: 2026-10-15  
Status: revised after ChatGPT High REQUEST CHANGES (r2 → R1–R3)  
Repo: vscode-markdown-workbench  
Branch: `docs/git-diff-vscode-ux`

## Review provenance

- Round 1: ChatGPT High REQUEST CHANGES **B1–B6** — local `/workspace/plans/chatgpt-git-diff-ux/ANSWER.md`; folded into this doc (commit `2e283e1`).
- Round 2: ChatGPT High REQUEST CHANGES **R1–R3** — local `/workspace/plans/chatgpt-git-diff-ux-r2/ANSWER.md`; this revision folds those three only.
- Chat: [Critique Git UX Design](https://chatgpt.com/g/g-p-6ad0841322fc81919438032f917cf8e8-markdown-workshop/c/6ad0beea-a44c-83ea-95ad-ac069f24867c)
- Locked product decisions below are unchanged. Author judgment: keep the shared model readable — enough state for correct peek mutations in v1, not an enterprise SCM framework.

## Goal

Keep Markdown Workshop’s own git diff surfaces (`gitGutter`, `gitInline`, `gitDiffEditor`). Borrow good VS Code interactions and chrome ideas; do **not** port or fork VS Code’s DiffEditor / Monaco source.

## Decisions (user, locked)

- Keep our own diff viewer; no VS Code DiffEditor source port.
- Borrow UX: click opens diff; **added** lines open diff; caret moves.
- Raw text in hunk body; Live Preview stays rendered.
- Shared language across `gitGutter` / `gitInline` / `gitDiffEditor` (data model, navigation vocabulary, actions, visual tokens — **not** identical rendering architecture).
- Not pixel-faithful to VS Code; inspired UX only.
- May reference microsoft/vscode for layout/token ideas; no wholesale source copy.

Clarification: **Custom git surfaces** share one hunk model, navigation vocabulary, actions, and visual tokens. `diffEditor=native` intentionally bypasses custom presentation and is an escape hatch, not a peer of the shared chrome.

---

## B1 / R1 — Semantic `DiffHunk` model (diff sides ≠ live document)

Replace the presentation-first open call `{ uri, range, changeIndex, total, compareTo }` with a semantic hunk first. Every surface (`gitGutter`, peek, `gitInline`, custom `gitDiffEditor`) **consumes the same `DiffHunk` / `HunkRef`**.

**Critical split:** comparison-side coordinates are always present. Live Preview coordinates are optional and exist only when a hunk is resolved into an editable worktree document.

### `DiffSnapshot` (generation)

| Field | Purpose |
|---|---|
| `generationId` | Immutable id for this compute pass (UI lifecycle / cancellation) |
| `repository` | Explicit repository root / identity |
| `base` | Comparison base side (see B2 / R2) |
| `target` | Comparison target side (see B2 / R2) |
| `sourceState` | Authoritative version vector used for mutation safety (see R2) |
| `liveDocumentUri?` | Optional URI of the Live Preview / editable document when this snapshot is mapped into one |
| `hunks` | Ordered `DiffHunk[]` for this file + comparison |
| `computedAt` | Wall time (diagnostics only — **not** a mutation identity) |

`N of M` is **derived** from the current snapshot’s hunk list for the same file + comparison. It is never stored as hunk identity.

### `DiffHunk`

| Field | Purpose |
|---|---|
| `hunkId` | Fingerprint within a snapshot (content + side ranges + comparison). Identity inside one immutable generation. |
| `generationId` | Must match owning snapshot |
| `originalRange` | **Base-side** line range (may be zero-length for pure inserts) |
| `modifiedRange` | **Target-side** line range (may be zero-length for pure deletes). This is the comparison target, **not** automatically the Live Preview. |
| `liveAnchor?` | Optional zero-width position in the Live Preview document (see B4 / R1) |
| `lines` | Ordered line records: `{ kind: 'context' \| 'add' \| 'delete', originalLine?: number, modifiedLine?: number, text: string }` — line numbers are comparison-side |
| `capabilities` | `{ canStage, canUnstage, canRevert, … }` from the Git layer for this comparison |

### When `liveAnchor` / `liveDocumentUri` exist

| Comparison | Live Preview mapping |
|---|---|
| `INDEX → WORKTREE` | Target **is** the worktree / Live Preview document. `liveDocumentUri` set; every hunk gets a `liveAnchor`. |
| `HEAD → INDEX` | Target is the **index**, not the Live Preview. Do **not** treat Live Preview as the modified side. `liveAnchor` only if the implementation explicitly maps an index hunk into the current worktree (v1 may omit). |
| `revision → revision` | Neither side is the Live Preview. Normally **no** `liveAnchor`. |
| `HEAD → WORKTREE` | Same as INDEX→WORKTREE for live mapping when shown against the open document. |
| `empty → untracked` | Target is the worktree file; `liveAnchor` as for WORKTREE. |

Contracts:

- `gitGutter` and `gitInline` **require** a valid `liveAnchor` (they decorate / open from the Live Preview).
- `gitDiffEditor` does **not** require `liveAnchor`.
- If no `liveAnchor`, opening/navigating must not pretend it can move the Live Preview caret accurately. Peek still shows comparison-side line numbers from `originalRange` / `modifiedRange`.

Rules:

- One shared hunk computation feeds gutter decorations **and** peek/open. Whitespace / algorithm settings must not diverge between bar and opened hunk.
- Open API shape (conceptual): `openHunk(ref: HunkRef)` where `HunkRef` is `{ generationId, hunkId }` (or equivalent). Surfaces resolve through the current snapshot; they do not pass raw `range` + `changeIndex` as identity.
- After edit / stage / revert, recompute snapshot; UI rematch vs mutation rematch differ (see B3 / R3).

---

## B2 / R2 — Explicit sides, source-state version vector, action matrix

Replace vague `compareTo` with an explicit pair **and** concrete identities.

### Side values (structured)

```text
base / target =
  { kind: 'HEAD', oid }           // resolved commit OID at compute time
| { kind: 'INDEX', fingerprint }  // per-file (or index) fingerprint available from the Git layer
| { kind: 'WORKTREE' }            // bytes come from disk or the live document — see sourceState.document
| { kind: 'revision', ref, oid }  // ref is the user-facing name; oid is the resolved object
| { kind: 'empty' }               // untracked / no base
```

Do **not** store bare category strings like `"revision"` without `ref` + `oid`.

### `sourceState` (mutation authority)

`generationId` alone is **not** enough to prove the underlying Git/document state is unchanged (events can lag). Mutations need an authoritative version vector captured at compute time:

```text
sourceState =
  baseOidOrFingerprint   // from base side
  targetOidOrFingerprint // from target side (index fingerprint when target is INDEX)
  document?              // { uri, version, isDirty } when liveDocumentUri is set / WORKTREE bytes come from TextDocument
```

Exact fingerprint mechanism follows whatever the existing Git API already exposes — do not invent a full-repo hash. The invariant:

> A mutation runs only if the source state against which its hunk was computed is still the source state being mutated.

`generationId` remains useful for UI lifecycle and cancelling in-flight recomputes. It is **not** the sole correctness proof for Stage / Unstage / Revert.

### Action matrix (capability-driven)

Actions come from the Git layer for that pair. Shared chrome must not infer Stage / Revert / Unstage from colors or string labels.

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

## B3 / R3 — Invalidation: UI nearest vs mutation exact + serialize

Every displayed hunk belongs to a `generationId` and a `sourceState`. Two resolution modes — do not mix them.

### What invalidates the snapshot

While peek (or inline-open) is open, any of these invalidate:

- document edits (including autosave-driven buffer changes);
- another editor modifying the same URI;
- Git index / HEAD / worktree changes (stage, unstage, commit, external git);
- our own Stage / Revert / Unstage completing.

### Passive refresh / navigation (UI continuity)

1. On document or Git-state change → recompute snapshot (new `generationId` + fresh `sourceState`).
2. If the open hunk’s fingerprint still matches → keep it; refresh `N of M` and line records.
3. Else select the **nearest surviving hunk** (same file + comparison) — UI continuity only.
4. If none remain → close the peek.

### Mutation path (Stage / Unstage / Revert) — exact or abort

Capture intent **before** any async work:

```text
ActionIntent {
  generationId
  hunkId          // fingerprint of the hunk the user clicked
  sourceState     // version vector from that snapshot
}
```

Then:

1. Synchronously enter **mutation-pending** for that file (or repository) — disable conflicting mutation controls; reject a second click on a stale generation (single-flight; not a transaction framework).
2. Re-read / validate authoritative `sourceState` (OIDs / index fingerprint / document version as applicable). If it does not match the intent → **ABORT**, refresh UI, clear pending.
3. Re-resolve the hunk by **exact** fingerprint + matching `sourceState`. If missing → **ABORT**. **Never** fall back to nearest surviving hunk for a mutation.
4. Execute the Git mutation only against that exact hunk.
5. On completion (success or failure): clear pending, recompute snapshot, apply passive UI rematch for whatever peek remains.

**No nearest fallback is ever allowed for Stage / Unstage / Revert.** Silently acting on a different hunk after a refresh is a correctness failure.

### Dirty unsaved documents

If the preview is from the in-memory `TextDocument` but the Git action would apply against disk/index, disable destructive buttons unless the existing Git layer can safely reconcile that exact buffer version (`sourceState.document`). Prefer disable over wrong-target mutation.

Initial Stage/Revert wiring may ship disabled until exact + `sourceState` validation and single-flight are in place (see build order).

---

## B4 — `liveAnchor` and focus policy (Live Preview–backed only)

There is one keyboard focus owner at a time. **`liveAnchor` is optional** (R1). Rules below apply only when the hunk has a valid `liveAnchor` (typically `INDEX → WORKTREE` / worktree-backed peeks from gutter or inline).

- **Add / change:** anchor at the corresponding live line (prefer the **clicked** line when opening from a multi-line hunk; prev/next may use hunk start).
- **Delete:** anchor at the zero-width deletion boundary in the live document; clamp correctly at BOF/EOF.

When `liveAnchor` is absent (e.g. `HEAD → INDEX`, revision→revision), do not move the Live Preview caret; peek navigation still uses comparison-side ranges.

### Focus / caret rules (when `liveAnchor` present)

| Action | Live Preview caret | Keyboard focus |
|---|---|---|
| Open via gutter (or collapsed inline click) | Move to `liveAnchor` (clicked line when applicable) | Remains in Live Preview |
| Explicit click / Tab / F6 into peek body | Unchanged unless user navigates | Transfers to peek |
| Prev / next | Update to that hunk’s `liveAnchor` (hunk start) if present | Retain whichever surface currently owns focus |
| Escape / close | Move to **currently displayed** hunk’s `liveAnchor` if present | Focus Live Preview |

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

`gitInline` is a thin adapter to `openHunk`, not a second UI. Requires `liveAnchor` (R1).

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
- Pure deletions: red `old` lines, empty `new` column; caret uses delete `liveAnchor` when present.
- Line numbers in the peek are **comparison-side** (`originalRange` / `modifiedRange`), even when `liveAnchor` differs (e.g. if a future mapping into worktree is added for HEAD→INDEX).
- Full-file `native` = existing native VS Code escape hatch (bypasses custom chrome).
- Full-file `rendered` = existing rendered Markdown compare.
- Shared language = data / chrome / navigation / tokens — **not** identical full-file rendering architecture.
- **Open Full Diff** from peek carries this snapshot’s `base → target` (and `sourceState` identities), not a rediscovery of “whatever Git diff is current” for the URI.

Optional later: `\ No newline at end of file` indicator for terminal-newline-only diffs.

---

## Surfaces

### `gitGutter` (default on)

- Change bars: added / modified / deleted (existing). Live Preview–backed; requires `liveAnchor`.
- Click bar **or** “Show Git Change” resolves the bar’s hunk from the current snapshot and calls `openHunk`.
- **Added** hunks open the same raw unified peek (requirement; today’s weaker add path must be fixed).
- Peek header: file label, explicit base→target label (with resolved identities when useful), derived `N of M` (file-local + comparison-local, wraparound), capability-gated Stage / Unstage / Revert, prev / next / close, and **Open Full Diff**.
- Opening follows B4 when `liveAnchor` is present.

### `gitInline` (default off)

- Word/line decorations remain optional; do not force default-on.
- Clicks follow B5 precedence and call the same `openHunk`.
- Intraline / word highlight is secondary overlay; line background remains the structural cue.

### `gitDiffEditor`

- SCM / Timeline / “Open Rendered Git Diff” keep our editor for custom modes.
- Prefer the same hunk model and navigation vocabulary; align title/actions styling with peek where practical.
- Does not require `liveAnchor`.
- Preserve `diffEditor` setting `native` | `rendered`; **do not remove** `native`.
- Stage/Revert in peek header is intentional hunk-level UX for v1 (not claiming parity with VS Code’s per-line diff-gutter actions).

---

## Shared module

Name TBD (e.g. `gitShared` or `shared/git-diff-chrome`). Responsibilities:

1. Snapshot / hunk computation (single source for gutter + peek + inline), including structured sides + `sourceState`.
2. `openHunk` / prev / next / close against current generation; UI nearest rematch.
3. Capability-gated action dispatch with **exact** hunk + `sourceState` checks and per-file single-flight mutation pending.
4. Theme tokens mapped to host when available — prefer real VS Code token names where they exist, e.g. `diffEditor.insertedLineBackground`, `diffEditor.removedLineBackground`, `editorGutter.addedBackground`, `editorGutter.modifiedBackground`, `editorGutter.deletedBackground`, `peekView.*`. Prefer non-opaque diff backgrounds so underlying decorations remain visible.
5. Unified raw peek widget (B6).

### Explicit non-goals (v1)

- Pixel-perfect VS Code chrome.
- Copying monaco-editor / vscode `diffEditor` TypeScript into the extension.
- Replacing CodeMirror with Monaco.
- Claiming full-file layout auto-switch parity with VS Code side-by-side ↔ inline width behavior.
- Per-line Stage/Revert in the full diff gutter (hunk-level only for v1).
- Cross-generation continuity keys / heuristic rematch beyond fingerprint + nearest for **UI** (mutation stays exact-only).
- Full-repo hashing or a general SCM transaction layer — per-file version stamps + single-flight is enough.

---

## Interaction summary

1. Click gutter mark (add/modify/delete) → resolve hunk from current snapshot → open raw unified peek; if `liveAnchor` present, Live Preview caret → that anchor (clicked line); focus stays in Live Preview; header shows derived `N of M`.
2. Prev/next cycle file-local + comparison-local hunks with wraparound; update caret per B4 when `liveAnchor` exists; retain focus owner.
3. Stage / Unstage / Revert only when `capabilities` allow **and** exact fingerprint + `sourceState` validate under single-flight (B2/R2, B3/R3). Never nearest-retarget a mutation.
4. Escape / close → focus Live Preview at currently displayed hunk’s `liveAnchor` when present.
5. Open Full Diff from peek with this snapshot’s base→target.
6. Inline collapsed click → same `openHunk`, subject to B5 precedence.

---

## Accessibility (minimum for v1)

- Raw unified hunk exposes sensible line semantics (added / removed / context) to assistive tech.
- All peek header actions are keyboard reachable.
- Explicit keyboard entry into the hunk body (Tab / F6 or documented command); next/previous hunk commands usable without the mouse.
- Aria labels may borrow VS Code wording ideas; do not require Accessible Diff Viewer feature parity in v1.

---

## Build order

1. **Shared semantic hunk layer** — repository; structured base/target (with OID/fingerprint/`{kind,ref,oid}`); `sourceState` version vector; `originalRange` / `modifiedRange`; optional `liveAnchor` / `liveDocumentUri`; immutable `generationId`; line records; capabilities; exact vs nearest rematch helpers; single-flight mutation gate. No chrome yet.
2. **`gitGutter` → raw unified peek** — pure adds, pure deletes, prev/next, deterministic focus restoration when `liveAnchor` present, passive stale refresh; Stage/Revert disabled until exact + `sourceState` + single-flight work, then enable per matrix.
3. **`gitInline` thin adapter** to the same `openHunk` with B5 precedence.
4. **`gitDiffEditor` chrome / navigation alignment** last (no `liveAnchor` required).

This tests the hard state model once instead of three visually consistent surfaces on an ambiguous contract.

---

## Implementation notes

- Prefer restyle + shared API over new editor architecture.
- Reference VS Code for measurements, aria label ideas, and **actual** theme token names (not merely similar colors).
- Preserve horizontal scroll and copy for long Markdown lines (URLs, tables, frontmatter).
- Responsive peek header: on narrow editors keep close + prev/next visible; overflow Stage / Revert / Open Full Diff into `…`.
- Tests (minimum): gutter click on added line opens peek; modified/deleted unchanged; caret = `liveAnchor` / clicked line for WORKTREE; HEAD→INDEX hunks have comparison-side ranges without pretending Live Preview is the target; stale / mismatched `sourceState` aborts mutation; nearest UI rematch does **not** retarget Stage/Revert; overlapping Stage clicks are single-flight; inline click does not steal link/checkbox/selection.
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
- Separate `continuityKey` heuristic beyond fingerprint (UI nearest is enough for v1).
- Half-open range formalization beyond “zero-length insert/delete at BOF/EOF” (implementers pick one convention and stick to it in one module).

---

## Approval history

1. User approved direction in chat (2026-10-15): keep own viewer; borrow UX (click → diff; added lines open diff); raw text inside hunk; Live Preview stays rendered; shared language across three surfaces.
2. ChatGPT High REQUEST CHANGES round 1 (same date): blockers B1–B6 — folded in `2e283e1`.
3. User approved revising with ChatGPT’s B1–B6 fixes (same date).
4. ChatGPT High REQUEST CHANGES round 2 (same date): blockers R1–R3 — this revision.
5. User approved folding R1–R3 only (real correctness); skip trivial/low-ROI asks; keep the model readable for v1 peek-mutation correctness.
