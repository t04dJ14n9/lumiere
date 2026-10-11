# Vim

Adds Vim editing and Ex commands, like Obsidian's Vim key bindings setting.
It defaults to off and transfers insert/normal mode between the note and table cells.

## How it works

The plugin provides mode inspection and transfer through the injected Vim service.
Live Preview identifies persistent widgets through an optional service query.
The Vim adapter corrects vertical table overshoots to source-line arithmetic,
including counts, operators and visual selections. Tables then map normal-mode
source landings into their cell editors.
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
- `motion.ts`: per-editor table motion correction and single-step entry into revealable blocks.
- `source-motion.ts`: pure source-line target decision for rendered table overshoots.
- `source-motion.test.ts`: counted, clamped, display-line and other-widget target regression units.
- `caret.ts`: pure detection of the normal, visual, insert, replace, operator-pending and prompt states.
- `caret.test.ts`: mode, pending-operator, prompt and stale-state regression units.

## Services, events and settings

Injects `editor` and `commands`, optionally `livePreview`; provides `vim`. No kernel event listeners or
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
bindings use Control on macOS as well as other platforms, leaving Command
shortcuts to the editor. No verify shortcut is assigned.

Normal-mode single-step `j`, `k`, `gj` and `gk` enter revealable rendered blocks
and reveal their source. Across rendered tables, every `findPosV` line motion
uses source-line arithmetic when layout would overshoot, including counted
`j`/`k`/`gj`/`gk`, operators and visual selections. Other widget kinds keep
the dependency's existing behavior.

Inside a table cell, normal-mode vertical boundary hops ignore counts and the
`g` prefix and move one row. Operators and visual selections inside cells keep
the dependency's behavior; Obsidian's hop would abandon that pending state.
At note boundaries, table exit retains a blank separator so subsequent prose
cannot become another table row.
