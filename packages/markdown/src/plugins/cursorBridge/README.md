# Cursor Chat and Edit (plugin id `cursorBridge`)

In Cursor, **Cmd/Ctrl+L** opens Cursor Chat and **Cmd/Ctrl+K** opens Cursor
Edit on the Live Preview selection, using Cursor’s native Accept/Reject. Plain
VS Code is unchanged. Obsidian has no built-in equivalent; this is Cursor muscle
memory on Markdown Workshop’s custom editor.

## How it works

Cursor's own Cmd/Ctrl+L and Cmd/Ctrl+K bindings outrank every extension's,
and VS Code's webview shell forwards keydowns to the workbench from a window
listener. In Cursor the note therefore claims those keys in **capture phase on
the document** (same pattern as undo), with a selection or caret: that stops
the forwarder before Vim or Cursor's weight-500 chord can see the event, then
asks the panel host (`panel-host.ts`) to run Cursor Chat or Cursor Edit.
Without a selection, Chat opens directly and Edit mirrors the caret into
Cursor's native editor. Host Insert Link and Vim's Ctrl+K consumer stay gated
off on Cursor. The commands and their keybindings stay for the palette and for
hosts where they win.

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
- `protocol.ts`: the webview asks whether it runs in Cursor, and for a hand-off.
- `webview.ts`: capture-phase Cmd/Ctrl+L and Cmd/Ctrl+K in Cursor, before Vim and the webview forwarder.
- `panel-host.ts`: answers the webview, per panel, by running the commands.
- `cursor.ts`: Cursor-host detection and Chat/Edit command routing.
- `selection.ts`: active panel selection or caret capture, with CRLF mapping.
- `handoff.ts`: Lease + version-safe native editor mirror.
- `host.ts`: Context key, command registration, VS Code handoff surface.

## Services, events and settings

The window half injects `editors`, `selections` and the host services `hostCommands`, `clipboard`, `dialogs`, `settings` and `agentHost`; provides no service. Sets
`markdownWorkshop.isCursorHost`. The panel half injects `rpc`, `agentHost`
and `hostCommands`; the webview half `editor` and `rpc`. Uses `handoffLease` from the host reclaim
module. `plugins.cursorBridge.enabled` defaults to true. Host keybindings for
Insert Link and Vim's shortcut consumer exclude Cursor; other Vim Control
chords keep their bindings. On macOS, Vim's Control chords remain separate from
the bridge's Command shortcuts.

## Limits and differences from Obsidian

Cursor-host only (`vscode.env.appName`). Does not
modify `agentBridge` or invent whole-file payloads. Cursor command ids are
best-effort internal commands, not a stable public API.
