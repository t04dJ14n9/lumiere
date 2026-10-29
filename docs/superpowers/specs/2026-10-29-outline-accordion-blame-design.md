# Markdown Outline accordion + git blame off by default

**Date:** 2026-10-29 (America/Los_Angeles)  
**Status:** Approved for implementation  
**Scope:** Native Explorer Markdown Outline (`lumiere.markdown.outline`) + git blame plugin default

## Summary

Make Markdown Outline behave like the Claude blog “Tree” scroll-spy by default: start collapsed, keep only the active ancestor path expanded, collapse every other branch. Drive expand/collapse through host tree APIs (no full refresh on caret moves). Keep follow-cursor on and the outline view visible in the primary sidebar (Cursor-like). Expose accordion vs expand-all-parents as a setting. Turn current-line git blame off by default; when enabled, use a milder GitLens-matching ghost color.

Reference behavior inspected on https://claude.dev/blog/solving-code-review-at-anthropic/ (claude.com mirror 404s). Claude’s rail is a custom DOM tree; Lumière keeps the **native** VS Code/Cursor tree in the Explorer — chevrons remain a host difference.

## Behavior

### Outline (default)

- Plugin `lumiere.markdown.plugins.outline.enabled` stays **true**.
- View contribution stays `visibility: "visible"` when a Lumière Markdown editor is active (already on main).
- `lumiere.markdown.outline.followCursor` stays **true**.
- New setting `lumiere.markdown.outline.expandMode`:
  - `accordion` (**default**): Claude-style path expand + sibling collapse.
  - `all`: today’s behavior — parents with children start expanded; follow only selects/reveals.
- Initial / after document refresh with no active path yet: every parent node **collapsed** (`expanded: false`).
- While `followCursor` is on and `expandMode` is `accordion`:
  - Compute the active heading for the caret (existing `headingAt` / `activeNode`).
  - Expand each ancestor of that heading, and expand the active node itself if it has children.
  - Collapse every other expandable node that is **not** on that path (siblings of each ancestor; other top-level branches).
  - Select and reveal the active node without taking focus.
  - Do **not** call full `tree.refresh()` solely to change expansion for a caret move.
- Document text changes still refresh the source and tree as today; after refresh, re-apply accordion for the current caret if follow is on.
- **Expand All** still expands the whole tree. The next follow-cursor update in `accordion` mode reasserts the single open path.
- Manual chevron expand/collapse is allowed; the next follow update in `accordion` mode overwrites expansion to the active path (accordion wins while follow is on).
- Clicking a heading still navigates to that offset (existing command). Expansion after jump comes from follow once the caret settles.

### Git blame

- `lumiere.markdown.plugins.gitBlame.enabled` / manifest `defaultEnabled`: **false**.
- When off, neither the end-of-line authorship chip nor its hover/tooltip appears (same plugin gate as today).
- Users can turn the plugin on in settings.
- When on, the end-of-line ghost color must be **milder**, matching GitLens trailing-line blame:
  - Prefer theme color `gitlens.trailingLineForegroundColor` when present.
  - Else fall back to `#99999959` (GitLens default: gray `#999999` at ~35% alpha), then existing VS Code `git.blame.editorDecorationForeground` / description / muted chain only after that.
  - Hover tooltip keeps normal editor-hover foreground (not the washed-out ghost color).

## Architecture

### `TreeHandle` (`packages/markdown/src/shared/host/workbench.ts`)

Add:

```ts
expand(node: TreeNode): Promise<void>;
collapse(node: TreeNode): Promise<void>;
```

VS Code adapter implements these against the existing `TreeView` / element map (same nodes used by `reveal`). `expand` should open the node (and may rely on `reveal(..., { expand: true })` if that is the cleanest host path). `collapse` must collapse that node without requiring a full tree data rebuild.

### `OutlineSource` (`plugins/outline/tree.ts`)

- Stop emitting `expanded: true` for every parent. Default parents to `expanded: false` (or omit / false).
- Keep `parent()`, `activeNode()`, `allNodes()` for path walks and Expand All.
- Optional helper: `pathTo(node)` → ancestors + self for accordion.

### `OutlineView` (`plugins/outline/view.ts`)

- Read `expandMode` (and existing `followsCursor()`).
- In `followCaret`, when accordion + follow:
  1. Resolve active node.
  2. Build the set of node ids that should be expanded (ancestors + active if it has children).
  3. For each id in that set, `await tree.expand(node)`.
  4. Walk expandable nodes (or track previously expanded ids) and `await tree.collapse(node)` for ids not in the set.
  5. `await tree.reveal(active, { select: true, focus: false })` without using reveal-as-the-only-expand mechanism if expand already ran.
- When `expandMode === "all"`, keep current follow behavior (reveal/select only; initial `expanded: true` for parents restored for that mode).
- `expandAll()` unchanged in intent; may still use reveal/expand visiting all nodes.
- Debounce (~300ms) stays; skip expand/collapse work when the active path id set is unchanged since the last accordion apply.

### Settings / manifests

- Outline `config`: add `expandMode` enum `accordion` | `all`, default `accordion`, resource scope; sync into generated `package.json` contributions.
- Git blame manifest: `defaultEnabled: false`; regenerate/update `package.json` `lumiere.markdown.plugins.gitBlame.enabled` default to `false`.

### Git blame color (`gitBlame.css`)

- `.mw-gb-ghost` color stack: `var(--vscode-gitlens-trailingLineForegroundColor, #99999959)` ahead of (or instead of relying solely on) `--vscode-git-blame-editorDecorationForeground`, so the ghost reads as quiet as GitLens even when the built-in git blame theme token is too strong.
- Confirm both light and dark themes remain readable but secondary to note text.

### Host / Cordis note

Any non-VS Code host that implements `TreeHandle` must implement `expand`/`collapse` or accordion degrades to no-op expansion (document in host README if applicable).

## Testing

- Unit: path set for nested headings; accordion collapses siblings; `expandMode: all` leaves parents expanded on build; blame default false in manifest/config snapshot tests.
- Unit/host: expand/collapse called without `refresh` on caret-only follow when path changes; no expand/collapse when path unchanged.
- Host GUI (real VS Code): open a multi-level note — outline starts collapsed; move caret into a deep H3 — only that branch open; move to another H2 — previous branch closed; Expand All then move caret — accordion returns; with blame plugin default install, no end-of-line chip until enabled.

## Out of scope

- Custom webview / Claude-styled TOC (progress %, `└` glyphs, sticky rail chrome).
- Changing sticky-scroll defaults (already on).
- PDF outline accordion.
- Removing native tree chevrons.

## Success criteria

- Fresh install: Markdown Outline visible beside Lumière notes, follow on, accordion default, parents collapsed until caret enters a section, only one branch open.
- `expandMode: all` restores prior expand-all-parents feel.
- Git blame off until the user enables the plugin; when enabled, ghost color matches GitLens mild trailing blame (`#99999959` / `gitlens.trailingLineForegroundColor`).
- Accordion path changes do not full-refresh the tree solely to toggle expansion.
