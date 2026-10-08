# Folding

Collapses headings and indented sections with gutter controls and commands,
corresponding to Obsidian's Fold heading and Fold indent settings.

## How it works

Heading ranges use metadata cached by immutable document identity; indentation
uses the configured tab width. The plugin owns the fold state, gutter, service
and `folded` view-state contribution. A private fold-service compartment updates
configuration while retaining ranges. Gutter invalidation observes configuration
and tab width. Disposal captures ranges before removing controls; late enable
restores valid saved ranges.

## Files

- `manifest.ts`: heading/indent settings and three command contributions.
- `api.ts`: fold service contract.
- `webview.ts`: range calculation, gutter, commands and reconfiguration.
- `view-state.ts`: fold capture, validation, source mapping and restore.

## Services, events and settings

Injects `editor` and `commands`; provides `fold`. No kernel events. Contributes
`folded` view state. `plugins.folding.enabled`, `folding.heading` and
`folding.indent` under `markdownWorkbench` default to true. Commands: Fold All,
Unfold All and Toggle Fold; no default keybindings.

## Limits and differences from Obsidian

Uses CodeMirror's gutter and fold mechanics with VS Code colors. Fold state is
per panel; two panels of one note may differ. Text and undo remain host-owned.
