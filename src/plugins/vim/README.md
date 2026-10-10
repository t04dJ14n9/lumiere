# Vim

Adds Vim editing and Ex commands, like Obsidian's Vim key bindings setting.
It defaults to off and transfers insert/normal mode between the note and table cells.

## How it works

The plugin provides mode inspection and transfer through the injected Vim service.
Its editor extension uses the override slot; host shortcut consumption is active
only with the plugin. Native undo/redo/save hooks route through Commands and are
restored on disposal. Ex callbacks become inert on disposal and are replaced when
the plugin is enabled again. A beforeinput guard suppresses normal-mode text/IME input.
The editor service draws the carets VSCodeVim shows (`docs/vim-caret.md`): a block
in normal mode (it stays a block while `r`, `f` or a count wait), the block plus
a one-pixel caret at the selection's end in visual mode, the editor's own caret
(`editor.cursorStyle`) in insert mode, an underline for replace, the lower half
of the character while an operator waits for its motion, and a one-pixel
underline while the search or ex prompt is open. Mode changes, completed
commands, keypresses, prompt open/close and selection updates refresh the
caret; a pending operator is detected in the input state, the prompt through
`cm.state.dialog`, and `R` is insert mode with overwrite enabled. Note and table-cell extensions
share this mode source and remove its listeners when they stop.

## Files

- `manifest.ts`: default enablement and host shortcut contributions.
- `api.ts`: mode, extension and mode-transfer contract.
- `webview.ts`: service, host action, Ex and editor extension registrations.
- `caret.ts`: pure detection of the normal, visual, insert, replace, operator-pending and prompt states.
- `caret.test.ts`: mode, pending-operator, prompt and stale-state regression units.

## Services, events and settings

Injects `editor` and `commands`; provides `vim`. No kernel event listeners or
emissions. `markdownWorkbench.plugins.vim.enabled` defaults to false. Ex commands
`:w`, `:q`, `:wq`, `:x`, `:u` and `:red` route to save, close, save-and-close, undo
and redo. Host shortcut bindings come from the manifest and are plugin-scoped.
Vim mode chooses the caret shape in every mode but insert, regardless of
`editor.cursorStyle`; insert mode is the editor's own caret, so `editor.cursorStyle`
and `editor.cursorWidth` apply there, as in VSCodeVim. Native blinking and smooth
movement settings apply in every mode (`explicit` smooth movement animates a
click but not a Vim motion, as VSCodeVim moves the cursor from code). Colours use VS Code's cursor theme tokens.

## Limits and differences from Obsidian

The dependency has no public `removeEx` API, so stopped callbacks are deactivated
rather than removed. Text, save and undo remain VS Code's. Mode transfer preserves
selection; exact Vim/IME interaction parity awaits the owner's manual testing.

The host-shortcut consumer is hidden from the command palette. Its collision
bindings remain those of the pinned source and still need owner comparison on
each platform; no verify shortcut is assigned.
