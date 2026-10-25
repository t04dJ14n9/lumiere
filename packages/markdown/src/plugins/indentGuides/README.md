# Indentation guides

Shows indentation guides at rendered list nesting levels in Live Preview and
at source tab stops elsewhere, corresponding to Obsidian's Show indentation
guides setting.

## How it works

A viewport view plugin calculates source indentation in columns, accounting
for tab stops. List chrome replaces leading whitespace with fixed visual steps.
In Live Preview, parsed list items and their prose continuations skip source
guides. CSS uses the list renderer's depth and indent step to paint guides across
each list row, including soft wraps. Code and quotes keep their source guides.
The plugin's owned editor registration gates all guide painting, including list
guides.

## Files

- `manifest.ts`: enablement and empty configuration schema.
- `webview.ts`: owned viewport decoration and guide enablement.
- `guides.ts`: source-column calculation and list-layout exclusion.
- `guides.test.ts`: tab stops, list exclusion and code/quote preservation.
- `indentGuides.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Injects `editor` and optionally `livePreview` to follow its mode; provides no
service and listens to/emits no kernel events.
`lumiere.markdown.plugins.indentGuides.enabled` defaults to true. No commands
or keybindings; tab size belongs to Editor.

## Limits and differences from Obsidian

Guides use VS Code theme colors. Source (and non-list Live Preview) guides
highlight the caret line's indent column with
`--vscode-editorIndentGuide-activeBackground1`, matching Obsidian's
`cm-active-indent`. Live Preview list chrome still paints depth guides without a
per-depth active marker. Separate source continuation lines in list prose have
no guides; their layout is not normalized by the list renderer. Quoted lists
and code retain source-column guides.

Guides use VS Code theme colors. Nested Live Preview list guides highlight the
caret's depth with `--vscode-editorIndentGuide-activeBackground1` (Obsidian
active indent). Source-mode active columns are tracked separately when that
path is enabled. Space-step list-prose continuations paint Obsidian nobullet
`cm-indent` guides via `--list-guide-depth`; hang continuations keep ancestor
`--list-depth` guides only (no extra hang column), matching Obsidian 1.14.4 LP.
Separate source continuation lines in list prose that the list renderer does
not normalize still lack guides. Quoted lists and code retain source-column
guides.
