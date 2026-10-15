# Obsidian Compatibility

Uses a vault's Obsidian property types and eight Files & Links/editor policies in
Markdown Workbench, like Obsidian's vault configuration. This is a host-only
feature, enabled by default in the Obsidian preset.

## How it works

Core `vault` discovers the root using `vault.rootMarkers`. Compatibility separately
selects `.obsidian` (or `obsidianCompat.configFolder`) under that root, and the host
checks containment and symlinks before reading or writing. Each resolved vault
owns its watchers, last-good snapshots and serialized property-type write queue.
The plugin registers an in-memory configuration provider; editor initialization,
vault indexing, note creation and rename commands use that shared configuration.
Explicit VS Code values at **any** applicable user/local/remote/workspace/folder
or language layer win over Obsidian candidates, which win over package defaults.
Inspection uses the originating resource and Markdown language scope. No VS Code
settings are written. Watcher changes and plugin teardown notify those consumers.

## Files

- `manifest.ts`: feature switch and resource-scoped config-folder setting.
- `host.ts`: service publication, provider registration and lifecycle effects.
- `api.ts`: vault/document-scoped registry API, wire types and typed change event.
- `types-document.ts`: lossless JSON edits, built-in guards and UI/wire conversion.
- `types-registry.ts`: last-good property cache, operation queue and conflicts.
- `app-settings.ts`: the eight ranked `app.json` mappings and input validation.
- `precedence.ts`: pure detection of all explicit inspect layers.
- `config-dir.ts`: independent, contained config-folder selection.
- `config-files.ts`: strict host file I/O, containment and final conflict check.
- `vault-config.ts`: one vault's file watchers and app/property snapshots.
- `vault-configs.ts`: caches, scope resolution, profile changes and teardown.

## Services, events and settings

Injects `workbench` and `vaults`; provides `obsidianCompat`. All registry methods
take `{vaultRoot}` or `{documentUri}`. Getters return promises so scope discovery
cannot silently fall back to the active editor. `getPropertyTypes` returns an
immutable map including unknown type strings; `setPropertyType(scope, name,
wireType | null)` edits only `types.json` (null removes the preference).
`getObsidianOverrides` returns mapped candidates, before explicit-setting filtering.
`onDidChangeVaultConfig` returns a disposer. Consumers own subscriptions with
their context. Listens to `editor/opened`, `vault/resolved`, active-note and
configuration changes; emits `obsidianCompat/changed` with `{vaultRoot}`.

Settings: `markdownWorkbench.plugins.obsidianCompat.enabled` (true) and
`markdownWorkbench.obsidianCompat.configFolder` (`.obsidian`). Core plugins keep
owning their settings. Supported `app.json` mappings, in rank order:

| Obsidian | Workbench |
| --- | --- |
| `useMarkdownLinks` | `links.useWikilinks` (inverse) |
| `newLinkFormat` | `links.newLinkFormat` |
| `attachmentFolderPath` | `files.attachmentFolder` (`/` → empty) |
| `newFileLocation` + `newFileFolderPath` | `files.newNoteFolder` (root → empty, current → `.`, folder → path) |
| `userIgnoreFilters` | `vault.excludedFiles` |
| `propertiesInDocument` | `properties.display` |
| `livePreview` | `editor.defaultMode` (true → livePreview, false → source) |
| `alwaysUpdateLinks === true` | `linkUpdates.mode` → always (false contributes nothing) |

## Limits and differences from Obsidian

The property UI still uses its existing preference storage; it does not yet
consume this registry. Host consumers can use the scoped service now. Wire types
are `text`, `number`, `checkbox`, `date`, `datetime`, `multitext`, `tags`, `aliases`.
`multitext` maps to the `list` editor; `aliases` and `tags` keep their distinct
wire/UI kinds. Built-ins are guarded: tags → tags, aliases → aliases,
cssclasses → multitext. Unknown root keys and registry entries survive edits.
An unreadable/invalid file retains the last good snapshot (empty memory if none)
and logs once per file/vault; it never authorizes a replacement write. Missing
files mean inference only and are created only by an explicit service edit.

Edits re-read their base and reject changes with `TypesRegistryConflict`, including
a final check after asynchronous directory/containment work. The VS Code file API
has no atomic compare-and-swap, so a separate writer can still race the final
read/write interval. Profile changes join the previous writer before replacing
watchers. Filename selection is scoped to the vault, not individual notes.
Ignored-file prefixes and globs use MW's existing exclusion semantics; Obsidian
regular-expression filters are not translated. Changes to `editor.defaultMode`
affect new editor views, preserving an existing view's current mode.

CSS snippets, appearance, templates, daily notes, graph configuration, hotkeys,
themes, workspace state and community plugins are outside this phase.
