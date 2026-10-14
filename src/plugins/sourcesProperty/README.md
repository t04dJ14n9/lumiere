# Sources

Shows an OKF `sources` property as stacked read-only rows and opens an allowed
resource, in the same place Obsidian would show that property in the properties
sheet.

## How it works

The properties sheet asks `propertyRenderers` for `sources`. Each entry becomes
a row in document order. The first eight rows are visible; the rest stay in the
page and appear when the disclosure is opened. A click sends the resource string
to the host. The host reads the owning document again, refuses a resource that
is no longer there, and allows only `http`/`https` or a path inside the note's
bundle. The webview does not fetch the resource.

## Files

- `manifest.ts`: feature identity. There are no commands or settings.
- `markup.ts`: read-only row HTML, including malformed values.
- `bind.ts`: disclosure, copy and open clicks. It does not edit YAML.
- `open.ts`: stale-row and navigation plan.
- `protocol.ts`: open and copy RPC.
- `webview.ts`: registers the `sources` renderer.
- `host.ts`: authorizes the current document and opens the target.
- `markup.test.ts`: disclosure, refused URLs and a stale row.

## Services, events and settings

Injects `propertyRenderers` and `rpc` in the webview, and `workbench`, `rpc`,
`okf`, `resources` and `vaults` on the host. Provides nothing. Listens to no
events. No settings. The property name is `sources`.

## Limits and differences from Obsidian

Rows are unconditionally read-only. There is no edit, add, apply or cancel
control in this version; writing sources needs its own design. The panel does
not fetch previews, titles or remote contents. `id` is shown only when the
entry has one. Positional labels are not citation keys. Scope text that is not
a link stays plain text.
