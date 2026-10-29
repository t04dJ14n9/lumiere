# Markdown Outline accordion + git blame off by default

**Date:** 2026-10-29 (America/Los_Angeles)  
**Status:** Approved for implementation  
**Scope:** Native Explorer Markdown Outline (`lumiere.markdown.outline`) + git blame plugin default

## Summary

Make Markdown Outline behave like the Claude blog “Tree” scroll-spy by default: start collapsed, keep only the active ancestor path expanded, collapse every other branch. Drive expand/collapse through host tree APIs (no full refresh on caret moves). Keep follow-cursor on and the outline view visible in the primary sidebar (Cursor-like). Expose accordion vs expand-all-parents as a setting. Turn current-line git blame off by default.

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
- Users can turn the plugin on in settings; no separate “milder color” change in this spec (tracked separately if needed).

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

### Host / Cordis note

Any non-VS Code host that implements `TreeHandle` must implement `expand`/`collapse` or accordion degrades to no-op expansion (document in host README if applicable).

## Testing

- Unit: path set for nested headings; accordion collapses siblings; `expandMode: all` leaves parents expanded on build; blame default false in manifest/config snapshot tests.
- Unit/host: expand/collapse called without `refresh` on caret-only follow when path changes; no expand/collapse when path unchanged.
- Host GUI (real VS Code): open a multi-level note — outline starts collapsed; move caret into a deep H3 — only that branch open; move to another H2 — previous branch closed; Expand All then move caret — accordion returns; with blame plugin default install, no end-of-line chip until enabled.

## Out of scope

- Custom webview / Claude-styled TOC (progress %, `└` glyphs, sticky rail chrome).
- Changing sticky-scroll defaults (already on).
- GitLens color parity for blame text (separate ask).
- PDF outline accordion.
- Removing native tree chevrons.

## Success criteria

- Fresh install: Markdown Outline visible beside Lumière notes, follow on, accordion default, parents collapsed until caret enters a section, only one branch open.
- `expandMode: all` restores prior expand-all-parents feel.
- Git blame off until the user enables the plugin.
- Accordion path changes do not full-refresh the tree solely to toggle expansion.
