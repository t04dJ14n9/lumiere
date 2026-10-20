# Sources

Shows an OKF `sources` property as stacked rows with open links. Treated as a
known OKF type in Properties (not Obsidian Unknown JSON, not a YAML draft under
the rows). Edit complex values in Source mode.

## How it works

The properties sheet asks `propertyRenderers` for `sources` on the first paint
and again when a renderer is registered or removed. The custom rows are the typed UI. A path
or `http`/`https` resource in the rows is clickable; scope text is not. A click
sends the resource string to the host. The host re-reads the owning document,
refuses a resource that is no longer there, strips a `#fragment` before the file
lookup, and allows only `http`/`https` or a path that stays inside the vault. Id
text is plain selectable text; there is no Copy id control. Clicking
"Showing N of M (default preview 3; `properties.listPreviewCount`)" reveals every row and remembers that disclosure for the
panel session so a remount (and estimatedHeight while the sheet is off-screen)
keeps the expanded height instead of jumping back to the first-eight reserve.

## Files

- `manifest.ts`: feature identity. There are no commands or settings.
- `markup.ts`: stacked row HTML, including malformed values.
- `bind.ts`: disclosure and open clicks.
- `open.ts`: stale-row and navigation plan.
- `protocol.ts`: open RPC.
- `webview.ts`: registers the `sources` renderer.
- `host.ts`: authorizes the owning document, contains the target, and opens it.
- `markup.test.ts`: disclosure, refused URLs and a stale row.

## Services, events and settings

Injects `propertyRenderers` and `rpc` in the webview, and the host service `hostCommands`, `rpc`,
`okf`, `resources` and `vaults` on the host. Provides nothing. Listens to no
events. No settings. The property name is `sources`.

## Limits and differences from Obsidian

Nested `sources` entries edit as YAML text rather than per-field forms. Open
links remain for navigable resources. The panel does not fetch previews, titles
or remote contents. `id` is shown only when the entry has one. Positional labels
are not citation keys. Scope text that is not a link stays plain text.
