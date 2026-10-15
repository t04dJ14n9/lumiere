# SCM → Workbench inline routing (follow-up)

**Status:** deferred. Not shipping as Source Control click default until
ChatGPT Pro B1/B2 are satisfied.

## Shipped separately (this PR family)

- No Working Tree peek for pure **added** hunks (gutter bar only).
- Gutter bar `title` / `aria-label`: `added` | `modified` | `deleted`.

## Not claimed yet

Opening a changed `.md` from Source Control must **not** be advertised as
opening Markdown Workbench with `gitInline` until:

### B1 — Routing feasibility

Demonstrate a reliable path (or ship a fallback **SCM context-menu command**
first):

- Intercepting native `TabInputTextDiff` / SCM open without breaking ordinary
  file↔file Markdown diffs.
- Cursor Remote SSH / CVM behavior with custom editor associations and the
  warm/`openWith` handoff (no “unexpected error” Working Tree tab).
- Clear product choice: click default vs explicit command.

### B2 — Staged vs unstaged baselines

Make baselines explicit before any takeover edits the working file:

- Unstaged: **index → working tree** (or HEAD→WT when nothing is staged —
  document which).
- Staged: **HEAD → index**; must not present or mutate the wrong snapshot.
- Cover deleted, untracked, rename, and conflict entries without opening an
  editable wrong revision.

## Candidate shape (when unblocked)

- Optional `gitDiffEditor.diffEditor: inline` (not default until B1/B2).
- Optional enabling `gitInline` by default only after SCM path is proven, or
  force-on only for the routed open.
- Prefer open Workbench **before** closing the native diff; require `git:`
  original + `file:` modified for any takeover.
