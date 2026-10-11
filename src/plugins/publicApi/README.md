# Extension API

Lets other installed extensions inspect notes and contribute host actions, markers
and fence processors. It plays the role of Obsidian's plugin API without executing
outside code in the editor webview.

## How it works

The native adapter builds a frozen versioned facade from this core plugin's
injected services. External plugins run in separate kernel contexts exposing only
declared public services. Their host wrappers own registrations and event handlers.

## Files

- `manifest.ts`: locked core identity and host surface.
- `host.ts`: declared dependencies and facade lifetime boundary.

The facade lives in `src/host/api/`; `management.ts` implements plugin
management commands, and `open-reference.ts` implements explicit source
reference navigation through the same facade. `reference-target.ts` resolves
workspace-relative references with the native containment guard and asks
when several workspace folders match. The parser is shared pure logic in
`src/shared/agent-reference-input.ts`.

## Services, events and settings

Injects `workbench`, `editors`, `selections`, optional `vaults`. Provides
no kernel service. The adapter bridges editor/document/vault events to public
listeners. `markdownWorkbench.plugins.external` controls external providers by ID
at global, workspace or workspace-folder scope.

Commands, available in every preset (the minimal preset is the safe mode for
diagnosing plugins): **Manage Plugins** opens Settings filtered to the plugin
switches; **Show Plugin Status** lists every plugin of the active editor
(failed and waiting ones first, with what they wait for or the error), and
choosing one opens its switch. Obsidian shows the same information under
Settings → Core plugins and Community plugins.

**Open Copied Agent Reference** confirms or edits the clipboard's first-line
reference and opens the selected source range, including in remote notes.
It also works with no editor open. Full URI authority, query and escaping are
preserved; relative references cannot escape workspace roots through `..`
or symlinks. Dismissing the input or ambiguity picker opens nothing.

## Limits and differences from Obsidian

Host-only v1; webview modules remain deferred. Processors require workspace trust.
Public selections are host-held snapshots and reject stale or forged references.
See API.md for the complete contract and lifetime/error rules.
Native chat links do not reliably pass their selection into custom editors;
the explicit command is a fallback, not an interception of those clicks.
