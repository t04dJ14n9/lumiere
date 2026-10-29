# Folding

Collapses headings and indented sections with gutter controls and commands,
corresponding to Obsidian's Fold heading and Fold indent settings.

## How it works

Heading queries inspect only the requested lines in the shared syntax tree
(Live Preview's, else CodeMirror's), then scan sibling headings for the
section boundary. Results are cached by immutable document identity and the
tree they came from; no full metadata extraction is needed. While a large
note's tree is still a prefix, nothing parses the rest of it: a line past
the prefix has no fold yet, and the gutter asks again as the tree grows.
Indentation uses the configured tab width. The plugin owns the fold state,
gutter, service and `folded` view-state contribution. A private fold-service
compartment updates configuration while retaining ranges. Gutter invalidation
observes configuration, tab width and Live Preview's tree. Disposal captures
ranges before removing controls; late enable restores valid saved ranges.

## Files

- `manifest.ts`: heading/indent settings and three command contributions.
- `api.ts`: fold service contract.
- `webview.ts`: range calculation, gutter, commands and reconfiguration.
- `heading-fold.ts`: lazy heading ranges with per-document caching.
- `heading-fold.test.ts`: range parity, bounded gutter traversal, edit
  invalidation and folds from a prefix tree.
- `view-state.ts`: fold capture, validation, source mapping and restore.

## Services, events and settings

Injects `editor` and `commands`; provides `fold`. No kernel events. Contributes
`folded` view state. `plugins.folding.enabled`, `folding.heading` and
`folding.indent` under `lumiere.markdown` default to true. Commands: Fold All,
Unfold All, Toggle Fold, Fold More and Fold Less (`commands.ts`), as in
Obsidian, measured against it: Fold All folds nested sections too; Toggle Fold
acts only on a section that starts on the caret's line; Fold More folds the
innermost open section around the caret and Fold Less opens the outermost
folded one. No default keybindings.

## Limits and differences from Obsidian

Uses CodeMirror's gutter and fold state with VS Code colors. Until a large
note has finished parsing (usually well under a second after it opens), a
heading whose section runs past the parsed part folds only to the last parsed
line, and Fold All skips headings past it. Fold state is per panel; two panels
of one note may differ. Text and undo remain host-owned.
