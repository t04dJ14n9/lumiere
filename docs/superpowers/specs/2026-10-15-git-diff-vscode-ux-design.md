# Git diff viewer UX (borrow VS Code, keep our stack)

Date: 2026-10-15  
Status: draft for user review  
Repo: vscode-markdown-workbench

## Goal

Keep Markdown Workshop’s own git diff surfaces (`gitGutter`, `gitInline`, `gitDiffEditor`). Borrow good VS Code interactions and chrome ideas; do **not** port or fork VS Code’s DiffEditor / Monaco source.

## Decisions (user)

- All three surfaces share one visual/interaction language.
- Not pixel-faithful to VS Code; inspired UX only.
- Hunk / diff body shows **raw Markdown text** (not rendered HTML).
- Live Preview around the hunk stays rendered as today.
- Clicking a change (including **added** lines / green bars) opens our diff for that hunk and moves the caret to the corresponding place.
- May reference microsoft/vscode for layout/token ideas; no wholesale source copy.

## Surfaces

### `gitGutter` (default on)

- Change bars: added / modified / deleted (existing).
- Click bar **or** “Show Git Change” opens peek/diff for that hunk.
- **Added** hunks open the same raw-text peek (today may be weaker for pure adds — treat as a requirement).
- Peek header may include: file label, compare context (e.g. working tree vs HEAD/index), change index `N of M`, stage / revert / prev / next / close where we already support those actions.
- Opening peek moves focus/caret to the hunk in the Live Preview (and into the peek body when appropriate).

### `gitInline` (default off)

- Word/line decorations in the note stay optional.
- When inline mode is on, click on a highlighted change should converge on the same raw hunk viewer / navigation as gutter (shared open-hunk API), not a second divergent UI.

### `gitDiffEditor`

- SCM / Timeline / “Open Rendered Git Diff” paths keep our editor.
- Prefer raw-text hunk presentation consistent with peek when showing change detail; full-file compare may remain side-by-side raw or existing “rendered” mode via existing `diffEditor` setting (`native` | `rendered`) — **do not remove** `native` escape hatch.
- Align title/actions/nav styling with peek where practical.

## Shared module

Introduce a small shared layer (name TBD, e.g. `gitShared` or `shared/git-diff-chrome`) used by all three:

- Open-hunk API: `{ uri, range, changeIndex, total, compareTo }` → show raw diff widget.
- CSS tokens inspired by VS Code `diffEditor.*` / gutter colors, mapped to host theme when available.
- Dual line-number gutter optional for peek body (original | modified) when both sides exist; for pure adds, left empty / right only.
- Overview-ruler marks optional follow-up if not already present.

Explicit non-goals for v1 of this work:

- Pixel-perfect VS Code chrome.
- Copying monaco-editor / vscode `diffEditor` TypeScript into the extension.
- Replacing CodeMirror with Monaco.

## Interaction details

1. User clicks gutter mark on an added/modified/deleted line → open raw peek for that change; caret jumps to hunk; header shows `N of M`.
2. Prev/next cycle changes; stage/revert call existing git commands where already wired.
3. Escape / close returns focus to Live Preview at the hunk start.
4. Pure additions: show empty left (or “no prior lines”) and green right lines as raw text.

## Implementation notes

- Prefer restyle + shared API over new editor architecture.
- Reference VS Code only for measurements, aria labels, and color names.
- Tests: gutter click on added line opens peek; modified/deleted unchanged; caret position; no regressions on stage/revert when present.
- Ship behind existing plugin toggles; no forced enable of `gitInline`.

## Out of scope / later

- Full SCM multi-file session UI.
- Exact VS Code overview-ruler pixel layout.
- Making `gitInline` default-on.

## Approval

User approved this direction in chat (2026-10-15): keep own viewer; borrow UX (click → diff; added lines open diff); raw text inside editor.
