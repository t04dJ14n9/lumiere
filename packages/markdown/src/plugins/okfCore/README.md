# OKF

Shares Open Knowledge Format bundles across the window: which folder is a
bundle, how links inside it resolve, and which resources may be opened.

## How it works

The plugin watches the vault index and the manual bundle list. A folder that
contains `index.md` and a typed concept is a bundle, and so is a root listed in
settings, including the vault root. It registers a link policy with the vault.
Inside a bundle, a Markdown path is explicit: `/` is bundle-absolute, and any
other Markdown destination, including one without an extension, is relative to
the source file. A miss stays unresolved. Wikilinks, including `[[topic.md]]`,
keep the vault's own resolution. A rename into another bundle rewrites the
link as an explicit source-relative path. The policy is removed when the
plugin stops. Open panels share a facade, so turning OKF off does not restart
the editor.

## Files

- `manifest.ts`: the manual bundle list.
- `api.ts`: the `okf` service.
- `facade.ts`: a stable object the editor can hold while the plugin restarts.
- `policy.ts`: bundle-aware resolution and link text.
- `host.ts`: detection, the service and the policy registration.

Pure helpers live in `src/markdown/okf/`.

## Services, events and settings

Injects `workbench` and `vaults`. Provides `okf`. Listens to `vault/changed`
and `vault/resolved`. Setting: `markdownWorkshop.okfCore.bundles`, extra
vault-relative roots. The vault does not inject this plugin; the plugin
registers and unregisters its link policy.

## Limits and differences from Obsidian

Obsidian has no OKF bundle. Outside a bundle, links resolve as they do today.
An explicit OKF path that misses does not fall back to another file with the
same name. This plugin does not draw the graph or edit `sources`; those are
separate features.
