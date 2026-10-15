# Vault

Indexes every note in a vault so that links resolve the way Obsidian resolves
them, and so that backlinks, tags, suggestions and search never scan the disk.
It is Obsidian's `MetadataCache`.

## How it works

The root-level half provides `vaults`: one `VaultIndexer` per vault, created
when the first note in that vault opens and kept for the session. An indexer
starts from the snapshot saved by the previous session, so links resolve at
once, then lists the vault, parses only notes whose time or size changed (in
a worker, one at a time) and follows file events. While a note is open, its
unsaved text replaces the file on disk. Each panel's half provides `vault`,
the shared index of its note's vault.

Link resolution follows Obsidian's `getLinkpathDest` (DESIGN §12.3). When a
file appears, disappears or is renamed, only notes whose links mention its
name are resolved again.

## Files

- `api.ts`: `VaultIndex`, `Vaults`, `VaultSystem` (the VS Code side) and events.
- `host.ts`: the two plugin halves (`vaultsHost` at the root, `vaultHost` per panel).
- `registry.ts`: finds a note's vault and shares indexers; routes open documents.
- `roots.ts`: vault root discovery from root markers (DESIGN §12.1).
- `indexer.ts`: start-up, reconciliation, file events, overlays, saving.
- `parse-queue.ts`: sequential parsing with overlays and hash reuse.
- `memory-index.ts`: the in-memory index behind `VaultIndex`.
- `file-table.ts`, `resolve.ts`, `link-text.ts`, `link-maps.ts`: files and
  `uniqueFileLookup`, link resolution, new-link text, resolved and unresolved
  links.
- `exclusion.ts`: excluded-file filters and always-ignored folders.
- `snapshot.ts`: the persisted format.
- `manifest.ts`: root markers and excluded files settings.

The VS Code adapter is `src/host/vault-system.ts`; the worker is
`src/workers/vault.ts`, with its client in `src/host/vault-parser.ts`.

## Services, events and settings

- Injects `vaultSystem` (root) and `vaults` (panel). Provides `vaults` and
  `vault`. `vaults.registerLinkPolicy` lets another plugin override resolution
  and link text; the vault does not inject that plugin. Registering or
  removing a policy re-resolves links.
- Emits `vault/changed (root, change)` and `vault/resolved (root)`.
- Settings: `markdownWorkshop.vault.rootMarkers` (default `[".obsidian"]`),
  `markdownWorkshop.vault.excludedFiles`, and from `links`: `folderNote` and
  `newLinkFormat`.

## Limits and differences from Obsidian

- Links ignore case, as in Obsidian; an exact-case path wins.
- Excluded files are indexed and resolvable, as in Obsidian, and flagged
  `excluded` for the features that leave them out. A filter without wildcards
  is a path prefix (Obsidian's form); globs are also accepted.
- Hidden folders and `node_modules` are never indexed. Symbolic links to
  folders are not followed.
- A vault indexes at most 50,000 files and warns when it has more.
- A note outside every workspace folder is a vault of its own folder, with no
  index, watching or saved snapshot.
- Nested vaults: a folder with a root marker inside a larger vault is its own
  vault for notes inside it; the larger vault still indexes its files.
