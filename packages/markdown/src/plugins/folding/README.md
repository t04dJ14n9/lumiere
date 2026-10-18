# Folding

Collapses headings and indented sections with gutter controls and commands,
corresponding to Obsidian's Fold heading and Fold indent settings.

## How it works

Heading queries inspect only the requested lines in the shared syntax tree,
then scan sibling headings for the section boundary. Results are cached by
immutable document identity; no full metadata extraction is needed. Indentation
uses the configured tab width. The plugin owns the fold state, gutter, service
and `folded` view-state contribution. A private fold-service compartment updates
configuration while retaining ranges. Gutter invalidation observes configuration
and tab width. Disposal captures ranges before removing controls; late enable
restores valid saved ranges.

## Files

- `manifest.ts`: heading/indent settings and three command contributions.
- `api.ts`: fold service contract.
- `webview.ts`: range calculation, gutter, commands and reconfiguration.
- `heading-fold.ts`: lazy heading ranges with per-document caching.
- `heading-fold.test.ts`: range parity, bounded gutter traversal and edit invalidation.
- `view-state.ts`: fold capture, validation, source mapping and restore.

## Services, events and settings

Injects `editor` and `commands`; provides `fold`. No kernel events. Contributes
`folded` view state. `plugins.folding.enabled`, `folding.heading` and
`folding.indent` under `markdownWorkshop` default to true. Commands: Fold All,
Unfold All, Toggle Fold, Fold More and Fold Less (`commands.ts`), as in
Obsidian, measured against it: Fold All folds nested sections too; Toggle Fold
acts only on a section that starts on the caret's line; Fold More folds the
innermost open section around the caret and Fold Less opens the outermost
folded one. No default keybindings.

## Limits and differences from Obsidian

Uses CodeMirror's gutter and fold state with VS Code colors. Fold state is
per panel; two panels of one note may differ. Text and undo remain host-owned.
