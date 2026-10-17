# Math

Renders inline and display TeX formulas with MathJax, like Obsidian's math in
Live Preview. Moving the caret into a formula reveals its source, which reads
as code with its `$` delimiters in the accent colour; a display formula keeps
its rendered result below the source while you edit it. Clicking a formula
reveals it with the formula selected, without its delimiters, as in Obsidian.

## How it works

The plugin registers inline/block renderers and a render post-processor. MathJax
loads on demand; its SVG is sanitized before insertion. Each render pass owns its
pending result and restoration callback, and plugin disposal clears all remaining
renders. Editing commands wrap or unwrap the selection through CodeMirror.

## Files

- `manifest.ts`: feature metadata and the two command contributions.
- `webview.ts`: renderer, post-processor, cleanup and command registrations.
- `commands.ts`: pure selection edits and delimiter placement.
- `source.ts`: a formula's delimiters, and the span a click selects.
- `mathjax.ts`: lazy TeX-to-SVG conversion with supported TeX packages.
- `math.test.ts`: selection, delimiter and formula-span unit tests.
- `math.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Injects `editor`, `commands`, `livePreview` and `render`; provides no services.
Listens to `render/postProcess`; emits no events. Enabled by
`markdownWorkshop.plugins.math.enabled` (default true). Commands are Toggle
Inline Math and Insert Math Block; neither has a default keybinding.

## Limits and differences from Obsidian

Uses the configured MathJax TeX packages without user macros. Errors retain the
placeholder and show a render error. Save and undo belong to VS Code. Exact
visual parity with Obsidian awaits the owner's manual comparison.
