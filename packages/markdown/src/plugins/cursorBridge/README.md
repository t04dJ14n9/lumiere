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
confirmation). Verified Edit success also arms one-shot mirror cleanup: when
Edit ends, release that handoff's token and dismiss the text mirror so Live
Preview can return. A newer Edit for the same URI cancels the old watcher and
releases its token; Chat retains its existing tab-based lifetime. Failure
abandons immediately without arming a watcher. Stopping the bridge cancels its
watchers. Tab cleanup clears
established sessions only. Apply stays in Cursor; MW follows the document
model. Dirty notes are allowed without autosave.

## Files

- `manifest.ts`: Chat/Edit commands, Cmd/Ctrl+L / Cmd/Ctrl+K bindings and the prompt probe view.
- `protocol.ts`: the webview asks whether it runs in Cursor, and for a hand-off.
- `webview.ts`: capture-phase Cmd/Ctrl+L and Cmd/Ctrl+K in Cursor, before Vim and the webview forwarder.
- `panel-host.ts`: answers the webview, per panel, by running the commands.
- `cursor.ts`: Cursor-host detection and Chat/Edit command routing.
- `selection.ts`: active panel selection or caret capture, with CRLF mapping.
- `handoff.ts`: Lease + version-safe native editor mirror.
- `host.ts`: Context keys, command registration and one-shot Edit mirror cleanup.
- `edit-prompt-probe.ts`: empty Explorer tree and ownership of the armed context.
- `../../host/cursor-handoff.ts`: native handoff surface and mirror dismissal.
- `../../host/cursor-edit-end.ts`: prompt visibility observation and tab/editor departure backup.

## Services, events and settings

The window half injects `editors`, `selections` and the host services `hostCommands`, `clipboard`, `dialogs`, `settings`, `agentHost` and `views`; provides no service. Sets
`lumiere.markdown.isCursorHost` and `lumiere.markdown.editPromptArmed`. Registers
the empty `lumiere.markdown.cursorBridge.editPromptProbe` Explorer tree. The panel half injects `rpc`, `agentHost`
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
not closing, and extensions cannot read arbitrary context keys. The primary end
signal is an empty Explorer tree named **·**, contributed with the workbench
`when` expression `(editcontextbarcursor || editorHasPromptBar) &&
lumiere.markdown.editPromptArmed`. Verified Edit success arms the context; the
workbench evaluates Cursor's prompt-presence keys and makes the tree visible.
Once seen visible, its transition to hidden abandons the handoff immediately,
releasing the lease and dismissing the mirror even when `activeTextEditor`
stays on the native Markdown editor throughout X or Esc. An initially hidden
probe does not imply completion. The watcher invokes no commands.

Each cleanup disarms its probe ownership on end, replacement or shutdown;
failures never arm. Multiple live handoffs share the window's armed context
until their last owner releases it. As a hard backup, tab/editor events and a
250 ms poll detect closing the last native text tab or leaving the mirror,
after a 500 ms opening grace. Prompt visibility transitions need no grace.
Focus-return and visible-range capacity heuristics are no longer used.

The probe has no roots and is never revealed or focused, but its header/empty
area can briefly flash or shift Explorer sections while Edit is open. Public
visibility also changes if the user collapses the probe or hides Explorer:
that can look like prompt removal. A collapsed probe or a closed Explorer can
prevent observing prompt-open and leave cleanup to tab/editor departure. The
window-level prompt keys do not identify a URI; submitted inline diffs cannot
be proven settled through these APIs. Closing the mirror reveals the Live
Preview sibling, or allows existing reclaim events to restore it. Obsidian has
no equivalent native Cursor handoff.
