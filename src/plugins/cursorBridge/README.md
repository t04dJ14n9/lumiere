# Cursor Chat and Edit (plugin id `cursorBridge`)

In Cursor, **Cmd/Ctrl+L** opens Cursor Chat and **Cmd/Ctrl+K** opens Cursor
Edit on the Live Preview selection, using Cursor’s native Accept/Reject. Plain
VS Code is unchanged. Obsidian has no built-in equivalent; this is Cursor muscle
memory on Markdown Workshop’s custom editor.

## How it works

The host captures a flushed, version-checked selection from the active panel,
discovers Cursor commands, acquires a reclaim handoff lease, warms the shared
`TextDocument`, rechecks document version and text after that async work, mirrors
the range with `positionAt` into a focused native text editor, then runs Cursor’s Chat or Edit
command after a final synchronous check of the active editor, version, text and
range. Each handoff acquires a pending lease token and promotes it after native
editor confirmation. Tab cleanup clears established sessions only, preserving
overlapping handoffs still warming or opening text. A failed handoff releases
only its own token. The lease suppresses reclaim for the whole native session
and ends when the last native text tab for the note leaves the text editor.
Same-URI Workshop tab changes keep the lease, and
a later Preview | Markdown switch can restore Markdown Workshop. Apply stays
in Cursor; MW follows the document model. Dirty notes are allowed without
autosave.

## Files

- `manifest.ts`: Chat/Edit commands and Cmd/Ctrl+L / Cmd/Ctrl+K bindings.
- `cursor.ts`: Cursor-host detection and Chat/Edit command routing.
- `selection.ts`: Active panel selection capture.
- `handoff.ts`: Lease + version-safe native editor mirror.
- `host.ts`: Context key, command registration, VS Code handoff surface.

## Services, events and settings

Injects `editors`, `selections` and `workbench`; provides no service. Sets
`markdownWorkshop.isCursorHost`. Uses `handoffLease` from the host reclaim
module. `plugins.cursorBridge.enabled` defaults to true. When disabled, Insert
Link keeps Cmd/Ctrl+K even with a selection on Cursor.

## Limits and differences from Obsidian

Cursor-host only (`vscode.env.appName`). Empty selection is a no-op. Does not
modify `agentBridge` or invent whole-file payloads. Cursor command ids are
best-effort internal commands, not a stable public API.
