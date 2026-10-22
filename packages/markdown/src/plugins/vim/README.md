# Vim

Adds Vim editing and Ex commands, like Obsidian's Vim key bindings setting.
It defaults to off and transfers insert/normal mode between the note and table cells.

## How it works

The plugin provides mode inspection and transfer through the injected Vim service.
A shared keyboard adapter translates Chinese Shift+4 (`￥`/`¥`) and Shift+6
(`……`/`…`), including `Process` events with those physical codes, to `$` and `^`
in normal mode. The same capture path also maps IME `Process`/`Unidentified`
keydowns on `KeyA`–`KeyZ`, `Digit0`–`Digit9` (Shift for `*`/`#`/`$`/…), and punctuation codes
(`.`, `,`, `;`, `/`, `?`, `-`, `[]`, `'`, backticks, …) to the matching Latin command keys in normal
and visual mode (so `gg`, `G`, word motions, counts, `dd`/`yy`, `f`/`t` and
`.`-repeat still run when the host's beforeinput guard blocks Vim's text-input
fallback). Chinese punctuation glyphs `。`/`，`/`；` map to `.`/`,`/`;` except
in insert mode and while `f`/`t`/`r` wait for a literal argument. It delivers
the translated key through the ordinary Vim dispatcher so counts, operators,
mappings and recording keep their native behavior. Insert mode, prompts and
active composition are excluded; ASCII keys are never rewritten.
A scoped key-dispatch hook routes remaining mapping and macro keys to the note
adapter after a cell document jump, while its current motion finishes bookkeeping.
The executor receives forwarding adapter and mode objects: at the next key lookup,
its cached references follow the destination for mode checks, literal insertion,
special keys and separately recorded macro insert changes. The real cell state
stays available to its teardown hooks.
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

While visual mode is active, Live Preview reveal stays frozen at the selection from when visual started, like the pointer-drag freeze, so extending the selection does not reflow blocks and jump the viewport.
Mode events queue freeze/thaw transactions after CodeMirror's update lifecycle;
the event's target mode also thaws visual-to-insert commands. The Vim extension
owns the freeze field, so disabling Vim removes it during reconfiguration and
cancels pending work without dispatching from plugin cleanup.
The first `i` after a rendered widget selects source leaves Vim's automatic
visual mode at that selection's head, then uses the ordinary insert mapping.
Keyboard-created visual selections keep Vim's text-object behavior.

## Files

- `manifest.ts`: default enablement and host shortcut contributions.
- `api.ts`: mode, extension, mode-transfer and buffer-handoff contract.
- `key-routing.ts`: adapter-scoped mapping/macro handoff and dispatcher restoration.
- `keyboard.ts`: shared note/cell translation of Chinese shifted line-motion keys, Chinese punctuation, and IME Process/Unidentified letter/digit/punctuation command keys.
- `keyboard.test.ts`: key variants, physical codes, modifiers, IME Process letters and mode guards.
- `click-insert.ts`: first-key insert handoff from a rendered-source selection.
- `../../../test/unit/livePreview/click-position.test.ts`: source selection, typing and Vim handoff units.
- `test/unit/vim-key-routing.test.ts`: cross-buffer sequences, unaffected adapters and hook disposal.
- `webview.ts`: service, host action, Ex and editor extension registrations.
- `motion.ts`: per-editor table motion correction and single-step entry into revealable blocks.
- `source-motion.ts`: pure source-line target decision for rendered table overshoots.
- `source-motion.test.ts`: counted, clamped, folded and other-widget target regression units.
- `motion-context.ts`: per-editor resolved motion policy captured before Vim executes it.
- `motion.test.ts`: source/display goals, folds, mappings, macro replay and disposal units.
- `caret.ts`: pure detection of the normal, visual, insert, replace, operator-pending and prompt states.
- `caret.test.ts`: mode, pending-operator, prompt and stale-state regression units.
- `visual-reveal.ts`: freeze Live Preview reveal for the duration of visual mode.
- `visual-reveal.test.ts`: deferred mode transitions, insert commands, selection mapping and cleanup units.

## Services, events and settings

Injects `editor` and `commands`, optionally `livePreview`; provides `vim`. No kernel event listeners or
emissions. `lumiere.markdown.plugins.vim.enabled` defaults to false. Ex commands
`:w`, `:q`, `:wq`, `:x`, `:u` and `:red` route to save, close, save-and-close, undo
and redo. Host shortcut bindings come from the manifest and are plugin-scoped.
Vim mode chooses the caret shape in every mode but insert, regardless of
`editor.cursorStyle`; insert mode is the editor's own caret, so `editor.cursorStyle`
and `editor.cursorWidth` apply there. Setting `lumiere.markdown.vim.caretStyle`
(default **`obsidian`**) selects the look:

| Value        | Look                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `obsidian`   | CodeMirror fat caret as in Obsidian 1.14.4 (REA): accent fill, on-accent glyph, 1.06s step blink |
| `vscodevim`  | Measured VSCodeVim shapes (block, half-block operator-pending, thin visual end caret)            |
| `codemirror` | Stock CM-vim fat caret with inverse editor colours                                               |

Native blinking and smooth movement apply for `vscodevim`; Obsidian/CM profiles
pin the fat-caret blink. `explicit` smooth movement animates a click but not a
Vim motion. See `docs/vim-caret.md`.

## Limits and differences from Obsidian

Default caret is Obsidian's fat cursor (`vim.caretStyle: obsidian`). Choose
`vscodevim` or `codemirror` if preferred. The dependency has no public `removeEx`
API, so stopped callbacks are deactivated rather than removed. Text, save and
undo remain VS Code's. Mode transfer preserves selection; exact Vim/IME
interaction parity awaits the owner's manual testing.

Default `<C-p>` → `k` is unmapped while Vim is on so Ctrl+P stays Quick Open / suggest navigation (BH-021). Ctrl+B/I host consume yields while the formatting plugin is enabled so bold/italic win over page-back/jumplist (BH-024); physical PageUp still keyToKeys to `<C-b>` inside vim-core. Ctrl+Shift+H is not consumed so Replace in Files stays available (BH-026). Ctrl+Shift+X / Ctrl+Shift+T are not consumed so Extensions and Reopen Closed Editor stay available (BH-027). Ctrl+Alt+0..6 are not consumed so Set Heading stays available (BH-030). Formatting capture owns Ctrl+D for select-next-occurrence over vim half-page scroll (BH-028); PageDown still pages. Editor capture owns Ctrl+A for Select All over vim increment (BH-029); Ctrl+X with a selection cuts (empty Ctrl+X still decrements). The host-shortcut consumer is hidden from the command palette. Its collision
bindings use Control on macOS as well as other platforms, leaving Command
shortcuts to the editor. No verify shortcut is assigned.

Normal-mode single-step `j`, `k`, `gj` and `gk` enter revealable rendered blocks
and reveal their source. Across visible tables, source-line `j`/`k` correct
layout overshoots with fold-aware source arithmetic, including counts,
operators and visual selections. Single-step `gj`/`gk` can enter an adjacent
table using the adapter's resolved column. Display counts, wrapped movement
and half-page scrolling retain the dependency's layout behavior and pixel
goal. Fold-hidden tables do not contribute to correction. Other widget kinds
keep the dependency's existing behavior.

Inside a table cell, normal-mode vertical boundary hops ignore counts and the
`g` prefix and move one row. Operators and visual selections inside cells keep
the dependency's behavior; Obsidian's hop would abandon that pending state.
At note boundaries, table exit retains a blank separator so subsequent prose
cannot become another table row.
