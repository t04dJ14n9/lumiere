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

The facade lives in `src/host/api/`; `management.ts` there implements this
plugin's two commands over the facade's plugin catalog and states.

## Services, events and settings

Injects `workbench`, `editors`, `selections`, optional `vaults` and `agent`. Provides
no kernel service. The adapter bridges editor/document/vault events to public
listeners. `markdownWorkbench.plugins.external` controls external providers by ID
at global, workspace or workspace-folder scope.

Commands, available in every preset (the minimal preset is the safe mode for
diagnosing plugins): **Manage Plugins** opens Settings filtered to the plugin
switches; **Show Plugin Status** lists every plugin of the active editor
(failed and waiting ones first, with what they wait for or the error), and
choosing one opens its switch. Obsidian shows the same information under
Settings → Core plugins and Community plugins.

## Limits and differences from Obsidian

Host-only v1; webview modules remain deferred. Processors require workspace trust.
Public selections are host-held snapshots and reject stale or forged references.
See API.md for the complete contract and lifetime/error rules.
