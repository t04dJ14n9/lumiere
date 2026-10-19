# Cursor Chat and Edit (plugin id `cursorBridge`)

In Cursor, **Cmd/Ctrl+L** opens Cursor Chat and **Cmd/Ctrl+K** opens Cursor
Edit on the Live Preview selection, using Cursor’s native Accept/Reject. Plain
VS Code is unchanged. Obsidian has no built-in equivalent; this is Cursor muscle
memory on Lumière’s custom editor.

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

The host captures a flushed, version-checked selection from the active panel
and discovers Cursor commands. Chat with a selection still mirrors into a
focused native text editor (lease + version checks) before
`aichat.newchataction`. Edit is hybrid: warm/open the note as language
`markdown` (never an invalid `files.associations` viewType string), acquire a
reclaim lease, then invoke `aipopup.action.modal.generate` with `overrideUri`,
Monaco 1-based `overrideRange`, and `invocationType: "new"` **without** a
pre-handoff `showTextDocument`. Cursor’s handler returns a prompt-bar id on
success and `undefined` on silent no-ops — only a nonempty id string counts as
Edit, and `openCursorEdit` preserves that id. If override-only fails, the host
mirrors into a focused native tab and retries Edit without overrides, using
that editor and its selection. Passing
`overrideUri` again would force a reload through `workbench.editorAssociations`,
which can reopen Lumière instead of a text editor. If that still fails (or Edit
is missing/throws), it releases the lease, dismisses any native mirror, and
falls back to Chat so no orphan Plain Text tab remains. Each handoff acquires a
pending lease token and promotes it after verified Edit (or Chat’s native
confirmation). Verified Edit success arms one-shot mirror cleanup and shows a
left status-bar action (**Return to Lumière**). Clicking it releases that
handoff's token and dismisses the text mirror so Live Preview can return.
Hard backups still abandon when the last native text tab closes or the active
tab/editor leaves the mirror. An optional Explorer when-probe may also end
Edit if Cursor exposes prompt context keys; Host GUI has observed that Cursor
Edit Selection often does not, so X/Esc alone may leave the mirror until the
status-bar click or a tab leave. A newer Edit for the same URI cancels the old
watcher, hides the prior status entry, and releases its token; Chat retains
its existing tab-based lifetime. Failure abandons immediately without arming.
Stopping the bridge cancels its watchers and disposes the status item. Tab
cleanup clears established sessions only. Apply stays in Cursor; MW follows the document
model. Dirty notes are allowed without autosave.

## Files

- `manifest.ts`: Chat/Edit commands, Cmd/Ctrl+L / Cmd/Ctrl+K bindings, statusBar capability and the optional prompt probe view.
- `protocol.ts`: the webview asks whether it runs in Cursor, and for a hand-off.
- `webview.ts`: capture-phase Cmd/Ctrl+L and Cmd/Ctrl+K in Cursor, before Vim and the webview forwarder.
- `panel-host.ts`: answers the webview, per panel, by running the commands.
- `cursor.ts`: Cursor-host detection and Chat/Edit command routing.
- `selection.ts`: active panel selection or caret capture, with CRLF mapping.
- `handoff.ts`: Lease + version-safe native editor mirror.
- `host.ts`: Context keys, command registration, status-bar dismiss and one-shot Edit mirror cleanup.
- `edit-prompt-probe.ts`: optional empty Explorer tree and ownership of the armed context.
- `../../host/cursor-handoff.ts`: native handoff surface and mirror dismissal (reopens Lumière when no Live Preview sibling remains).
- `../../host/cursor-edit-end.ts`: optional when-probe visibility and tab/editor departure hard backup.

## Services, events and settings

The window half injects `editors`, `selections` and the host services `hostCommands`, `clipboard`, `dialogs`, `settings`, `agentHost` and `views`; provides no service. Sets
`lumiere.markdown.isCursorHost` and `lumiere.markdown.editPromptArmed`. Registers
the empty `lumiere.markdown.cursorBridge.editPromptProbe` Explorer tree and a
left status-bar entry bound to `lumiere.markdown.cursorBridge.dismissEditMirror`.
The panel half injects `rpc`, `agentHost`
and `hostCommands`; the webview half `editor` and `rpc`. Uses `handoffLease` from the host reclaim
module. `plugins.cursorBridge.enabled` defaults to true. Host keybindings for
Insert Link and Vim's shortcut consumer exclude Cursor; other Vim Control
chords keep their bindings. On macOS, Vim's Control chords remain separate from
the bridge's Command shortcuts.

## Limits and differences from Obsidian

Cursor-host only (`vscode.env.appName`). Does not
modify `agentBridge` or invent whole-file payloads. Cursor command ids are
best-effort internal commands, not a stable public API.

Cursor has no public Edit completion event: the prompt-bar id reports opening,
not closing, and extensions cannot read arbitrary context keys. Host GUI on
Cursor Edit Selection showed that X/Esc alone often leave the native Markdown
mirror open: `activeTextEditor` stays on the mirror, and the Explorer when-probe
(`(editcontextbarcursor || editorHasPromptBar) &&
lumiere.markdown.editPromptArmed`) may never become visibly true. The reliable
dismiss path is therefore a left status-bar action (**Return to Lumière**)
armed on verified Edit success; its click runs the same abandon path (release
lease + dismiss mirror). Tab/editor departure remains a hard auto backup
(500 ms opening grace, 250 ms poll). The when-probe stays as an optional weak
backup and must not be required for dismiss.

Each cleanup hides the status entry and disarms probe ownership on end,
replacement or shutdown; failures never arm. Multiple live handoffs share the
window's armed probe context until their last owner releases it; the status
bar tracks the most recently armed URI. Focus-return and visible-range capacity
heuristics are no longer used. Closing the mirror reveals a Live Preview
sibling when one is open; if only the mirror tab remained, dismiss reopens
Lumière via `vscode.openWith` in the mirror's group, in the background when
the reader had moved to another tab. A mirror the reader closed (Cmd+W, Close
All) is not reopened: the Edit-end watcher reports `restore: false` when the
mirror tab is in the closed-tab event (or disappears during the leave settle),
and dismiss closes any leftover text tab without `openWith`. Dismiss always
closes the mirror by tab identity so a focused custom editor is not mistaken
for the mirror when `activeTextEditor` still points at it. Verified Edit
stores Cursor's prompt-bar id and dismiss runs `aipopup.action.closePromptBar`
before closing the mirror; leftover bars make the next `modal.generate` reuse
them and return undefined (Host GUI: "Cursor Edit is unavailable"). When the
reader already closed the mirror, the id is cleared on the next Ctrl+K instead
of flashing the note open. Obsidian has no equivalent native Cursor handoff.
