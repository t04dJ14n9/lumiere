# HTML paste

Converts rich clipboard content into Markdown, like Obsidian's Auto convert HTML
setting. It works in the note editor and focused table cell editors.

## How it works

A capture listener finds the focused CodeMirror view, bypasses plain-text paste
and literal code, then runs the awaited `paste/transform` pipeline. HTML is
sanitized before conversion. Turndown handles ordinary blocks and literal escaping;
custom rules preserve tables, tasks, wiki references, math and callouts. The paste
applies only if the view, document and selection are still current.

## Files

- `manifest.ts`: default enablement.
- `api.ts`: typed paste data and transform event.
- `conversion.ts`: conversion setup and semantic rules.
- `special.ts`: math, callout and table conversion.
- `links.ts`: wiki/media destinations and unsafe-scheme filtering.
- `paste.ts`: code-context and stale-paste guards.
- `webview.ts`: sanitization, focused-view routing and listener lifecycle.

## Services, events and settings

Injects `editor`; provides no service. Emits and listens to the awaited
`paste/transform` pipeline; queries `editor/projectSelection` to preserve grid
paste. `markdownWorkshop.plugins.pasteHtml.enabled` defaults to true. No palette
command or bound verify shortcut.

## Limits and differences from Obsidian

The Markdown is written as Obsidian writes it, measured by pasting the same
HTML into both: `_italic_`, `- item` and `1. item` with one space and nested
lines four spaces in, `---` rules, compact tables with the `align` attribute's
alignment, link and image titles, and `%20` and `\(` `\)` in addresses. One
deliberate difference: Markdown characters in the copied text are escaped
(`\*`, `\_`, `\[`, `1\.`), so the note shows what was copied. Obsidian leaves
them, so `*a*` from a web page turns italic and `[[1]](#cite)` becomes a
wikilink.

Rectangular table paste retains TSV semantics; HTML conversion applies inside a
focused cell. Menu paste receives plain text from VS Code's clipboard API. Rich
paste does not download images or save attachments. Shift+Mod+V, code and property
inputs keep their native behavior. Asynchronous transforms are discarded after
an intervening edit or selection change; the user can paste again.
