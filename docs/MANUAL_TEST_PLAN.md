# Manual acceptance plan

The owner runs these scenarios with computer use. Results are **not run**;
passing automated smoke checks is not evidence of manual acceptance or Obsidian
parity. Use a disposable copy of `test/fixtures/vault`, never an owner's vault.
Never install this development extension into an existing VS Code/Cursor profile.
The native smoke harness creates its own `/tmp/markdown-workbench-e2e-*` profile.

## document and editor (Phase 3)

1. **Typing, saving and native history.** Setup: open `Core.md` with Markdown
   Workbench. Steps: type ASCII, CJK with IME, emoji and multiple lines; save;
   undo and redo; use Save and Close then reopen. Expected: text and disk agree,
   IME characters are not duplicated, save finishes pending edits, undo/redo
   follows native history and focus returns to the editor.
2. **Two panels and external changes.** Setup: split `Core.md` into two
   Workbench panels and open it as text in another group. Steps: place distinct
   selections and scroll positions in both panels, edit in each, undo from
   the other, then edit in the text editor. Expected: all three share one
   document; selections and scroll remain independent; edits synchronize
   without replacing newer text. Repeat with a filesystem edit of a saved note.
3. **CRLF.** Setup: save a disposable copy of `Core.md` as CRLF using the text
   editor. Steps: edit across lines in Workbench, save, undo, and inspect EOL
   in the text editor. Expected: file stays CRLF; source selection offsets,
   emoji and edits do not drift.
4. **Clipboard and focus.** Setup: `Core.md`. Steps: keyboard copy/cut/paste a
   selection containing Markdown; undo a cut/paste; copy to a text editor.
   Expected: exact source text is copied; native history owns the edit.
   Host clipboard read/write is available to plugin menus through the editor
   service. Structured property clipboard and HTML conversion are Phase 4.
5. **Recovery and view transfer.** Setup: two panels of `Core.md` with distinct
   selections/modes/scroll. Steps: reload the window, reopen the note, and
   restore a captured view after a rename (inlineTitle scenario in Phase 4).
   Expected: unsaved text follows VS Code recovery; each view restores its own
   selection, mode, disclosure and scroll, without contaminating the other.
   During transfer edit the document: stale captures must be rejected.

## livePreview, dialect and render (Phase 3)

1. **Reveal and modes.** Setup: `Core.md`. Steps: move the caret into and out
   of each emphasis, heading, list and block; select across syntax; switch
   Live Preview/Source in one of two panels; use the minimal preset in a
   disposable workspace. Expected: syntax reveals at the selection (including
   the last character of a block); Source/minimal show source without widgets;
   the other panel's mode stays independent. IME and drag selections remain
   stable while crossing syntax.
2. **Block rendering and motion.** Setup: `Core.md`. Steps: click Edit on the
   code/HTML block, edit it, Escape out, move ArrowUp/Down over the rendered
   block. Repeat with a block at EOF. Expected: sanitized block rendering
   returns; arrows cross the block as one unit; Escape at EOF goes before it.
   A block occupying the entire file has no outside caret position and remains
   source until navigation or new text creates one.
3. **Renderer lifetime.** Setup: rendered blocks in `Core.md`. Steps: switch
   Source/Live Preview repeatedly, close/reopen and edit blocks quickly.
   Expected: no duplicate widgets, stale asynchronous output or controls from
   disposed render passes. Feature-specific rendering belongs to Phase 4.
4. **Sanitization.** Setup: copy `Core.md` and add script, iframe, event-handler
   HTML and remote media. Steps: open in an untrusted disposable workspace.
   Expected: scripts/handlers do not execute and remote content does not load;
   editor typing and saving still work.

## commands and resources (Phase 3)

1. **Core commands.** Setup: `Core.md`. Steps: run Save, Undo, Redo, Save and
   Close, Close, Open as Text, Toggle Live Preview/Source from the palette;
   repeat save/undo/redo using their keys. Expected: commands act on the active
   panel/document; pending edits flush before the host action.
2. **Containment.** Setup: disposable vault with an inside file and a symlink
   pointing outside it. Steps: request the files from a resource-using plugin
   once Phase 4 is delivered. Expected: inside files resolve; traversal,
   sibling-prefix and symlink escape requests fail. Remote virtual filesystem
   symlinks also fail. Vault refresh/root discovery is Phase 5.

## Later plugin acceptance (not yet delivered)

Retired source scenarios remain discoverable individually in TEST_LEDGER.md.
Their retirement changes the testing method, not the delivery requirements.
Phase 4 will add runnable setup/steps/results for folding, lineNumbers,
indentGuides, spellcheck, autoPair, smartLists, vim, formatting, links,
codeBlocks, math, diagrams, callouts, footnotes, tasks, embeds, pagePreview,
properties, tables, inlineTitle, tags, suggest, search, pasteHtml, copyForAgent
and markers. Include table row drag with scrolling before a single drop and
split-view footnote undo (the source's two intermittent scenarios).

Unbound pending owner verification: strikethrough, highlight, inline code,
comment (including Mod+/), and cycle list/checklist. No `verify` key is bound.
The old fuzzers are retired: manually exercise repeated typing/deleting,
selection replacement, commands and Vim sequences; no fuzz operation count is
claimed by this plan.

## Phase 4 subset: settings and editor features

These features are implemented; the remainder of Phase 4 is still incomplete.
Use a disposable workspace and its workspace settings, never the owner's
profile. For each enabled feature below, turn
`markdownWorkbench.plugins.<id>.enabled` off and on while `Core.md` stays open.
Expected in every case: its behavior and commands disappear and return without
losing document text, selection or undo. Repeat in two panels and a multi-root
workspace with different folder settings. The default `obsidian` preset loads
enabled features; `minimal` loads none. Switching the preset itself currently
requires reopening the editor; do not use live preset switching as acceptance
of runtime feature enablement.

### folding

Setup: the Folding section in `Core.md`. Steps: use the gutter, then Fold All,
Unfold All and Toggle Fold from the command palette; set `folding.heading` and
`folding.indent` independently to false and back to true. Reload with a section
folded; disable and re-enable folding. Expected: heading folds stop at the next
same-level heading, indent folds include deeper children, the two settings act
independently, reload restores saved folds, and disabling unfolds and removes
its gutter/commands. Per-panel fold positions remain independent.

### lineNumbers

Setup: `Core.md`, fresh settings (default off). Steps: enable lineNumbers,
insert/delete multiple lines, open a second panel, then disable it. Expected:
source line numbers update in the enabled panels; gutter disappears when off.

### indentGuides

Setup: nested list in `Core.md`; default on. Steps: add mixed spaces/tabs before
children and scroll them out of view and back. Toggle indentGuides. Expected:
guides follow tab stops and leading indentation, never cover non-indented text,
and disappear when disabled. Validate appearance with the owner's theme.

### spellcheck

Setup: misspelled prose in `Core.md`, default on. Steps: inspect spelling
suggestions, disable spellcheck and repeat, then enable it. Expected: the
contenteditable spellcheck attribute follows the setting; actual underlines
and dictionaries depend on the VS Code/Electron host and OS language.

### autoPair

Setup: a blank line in `Core.md`. Steps: type brackets/quotes and Markdown
markers, wrap a selection, and Backspace an empty pair. Change
`autoPair.brackets` and `autoPair.markdown` independently; disable the plugin.
Expected: enabled families insert/remove pairs, disabled families type literal
characters; the other family retains its configuration. Undo remains native.

### smartLists

Setup: a list in `Core.md`. Steps: Enter at an item end, Enter on an empty item,
Backspace at an item start, and repeat with an ordered list. Disable smartLists
and repeat. Expected: enabled list continuation/exit follows Markdown editing;
disabled mode uses plain editor behavior without automatic list markers.

### vim

Setup: `Core.md`; Vim defaults off. Steps: enable Vim in Settings; exercise
normal/insert/visual modes, `i`, Escape, motions, selection replacement, IME in
insert mode, `:w`, `:q`, `:wq`, `:x`, `:u`, and `:red`. Reopen after close;
disable/re-enable Vim. Expected: text changes synchronize, ex commands use
native save/undo, normal-mode IME cannot insert stray text, and disabling
removes modal behavior. Repeat Ctrl/Cmd+O, B, I, K, Shift+X, Shift+T, Shift+H,
and Alt+0 through Alt+6: Vim-only host shortcut consumption must disappear
when disabled. No workspaceState toggle is used. Cell-editor Vim mode transfer
is not implemented until the tables plugin lands.

### formatting

Setup: Formatting section in `Core.md`. Steps: select `alpha`, use Toggle Bold,
Italics, Strikethrough, Highlight, Inline Code and Comment twice; repeat with a
caret in a word. Use Insert Link and edit its selected URL; Insert Horizontal
Rule; Set Heading 0 through 6; Toggle Bullet List, Numbered List and Blockquote;
Swap Line Up/Down. Repeat multiline selections ending at column zero and
backward selections. Expected: toggles preserve text, headings replace only
the heading prefix, column-zero endpoints exclude the following line, swapping
moves the selected lines, and all edits undo through the TextDocument.

Test Mod+B, Mod+I and Mod+K. Strikethrough/highlight/code/comment keys remain
unbound pending the owner's Obsidian Hotkeys observation. Disable formatting:
its commands/keys disappear; enabling restores them. Copy/cut formatted source
to a text editor and verify the Markdown characters, not rendered HTML.

## Remaining Phase 4 dependency gate

Do not treat this subset as the full feature release. Links, codeBlocks, math,
diagrams, callouts, footnotes, tasks, embeds, pagePreview, structured properties,
tables, inlineTitle, tags, suggestions, query blocks, pasteHtml, copyForAgent
and markers still need their runtime plugins and acceptance scenarios. In
particular, a properties sheet or interactive table must not be accepted merely
because its pure parser/HTML renderer passes unit tests. The source's table cell
edit projection, property draft reconciliation, menus, clipboard, Vim transfer
and rename focus rules need migration to the service/lifecycle model together.

## Links

Setup: open `Core.md` in the disposable fixture vault. Add `[[Core#Heading]]`,
`[[Missing note|alias]]`, `[web](https://example.com)` and `[local](Core.md#Heading)`.

1. Move the caret out of the wikilink: only its label is visible. Plain click
   follows it. Move into source: plain click edits, Cmd/Ctrl-click follows.
2. Select text across a rendered link and release: the selection remains and
   no navigation occurs. Cmd/Ctrl+Alt-click opens a second group.
3. Follow a heading and `#^block` reference; the caret scrolls to the target.
   Run Follow Link and Open Link to Side while the caret is within link syntax.
4. Click the missing wikilink: create and open one Markdown file without
   overwriting an existing file. Test the new-note folder setting.
5. Open an HTTPS link and an application scheme. The latter asks before opening.
   A path outside the vault and a symlink escaping it must be refused.
6. Run Insert Wikilink on selected text, then undo. Disable/re-enable the links
   plugin: wiki decorations, click behavior, commands and host handlers disappear
   and return. Repeat with two panels of the same document.

`links.newLinkFormat` and `links.useWikilinks` are consumed by Phase 5 link
creation/suggestion features; `links.folderNote` controls folder navigation.

## Code blocks

Setup: add fenced JavaScript, Python, an unknown language and indented code to
`Core.md`, followed by a paragraph so the caret can leave every block.

1. Move outside a fence: highlighted code and Copy appear. Copy yields the code
   without fence markers. Click a token: source appears at the corresponding
   UTF-16 offset. Include emoji and indentation in the example.
2. Type in a revealed fence: syntax highlighting stays, typing synchronizes,
   and native undo/redo restores it. Repeat with IME composition and Source mode.
3. Scroll a long fence in and out of view. Unknown languages stay readable.
4. Disable Code Blocks: enhanced renderers, copy buttons and source highlighting
   are removed; the core readable fence remains. Re-enable and repeat.

## Math

Setup: in `Core.md`, add `$x^2$`, a multiline `$$` formula with an AMS fraction,
invalid TeX and a paragraph after the formula.

1. Move the caret in and out: source reveals only at the selected formula;
   elsewhere sanitized MathJax SVG appears. Source mode shows the delimiters.
2. Select Unicode text, run Toggle Inline Math twice, and verify an exact source
   round trip. Insert Math Block, edit it, save and undo through native history.
3. Disable/re-enable Math during a slow first render. Disabled formulas stay
   readable source; a late async render must not restore an obsolete widget.
4. Check invalid TeX remains readable and does not prevent editing other content.

## Diagrams

Setup: add a fenced `mermaid` flowchart (`graph TD; A-->B`) and a malformed
Mermaid fence to `Core.md`.

1. Outside the block, verify the flowchart renders. Enter it to edit source;
   leave it to see the update. Invalid input stays readable and editable.
2. Disable/re-enable Diagrams: the source code fallback replaces the diagram,
   then rendering returns. Repeat while the lazy library is loading.
3. Test a diagram with an HTML label or script-like content: no script or external
   action runs. Check light/dark themes and two panels with independent carets.

## Callouts

Setup: in `Core.md`, add normal, nested and foldable callouts, including
`> [!warning]- Closed title`, `> [!tip]+ Open title` and an unknown callout kind.

1. Leave their source: verify titles, body Markdown, nesting and default open
   states. Toggle disclosure, move away, edit elsewhere and reload the window;
   the state persists in that panel. A second panel has independent state.
2. Put the caret inside: syntax reveals and normal text editing works. Run
   Insert Callout on multiple selected lines and undo the single source edit.
3. Disable/re-enable Callouts: widgets, disclosure listeners, styling and command
   disappear and return. Source stays unchanged. Links in titles must follow
   links without also toggling disclosure.

## Footnotes

Setup: in `Core.md`, add repeated named references, an inline `^[note]`, a
multiline definition with indented continuation paragraphs, and references inside
a callout/table. Include nested Markdown and math in the note text.

1. Leave references: check labels/numbering. Hover or focus a reference for a
   rendered preview; Escape dismisses it. Activate it to reveal the definition.
2. Edit a definition and leave it: every reference preview reflects the change.
   A multiline definition renders as one block and reveals as one source range.
3. Insert Footnote on a selection and at EOF, including an existing numeric label;
   verify a fresh label, preserved selected text and native undo/redo.
4. Open two panels, insert a footnote in one, then undo there. Verify both converge
   without retaining an extra undo step (the source suite's intermittent case).
5. Disable/re-enable Footnotes: references, previews, definition widgets and the
   insertion command disappear and return. Source and caret remain valid.

## Tasks

Setup: in `Core.md`, add unchecked/checked tasks, a custom `[?]` status, nested
and quoted ordered tasks, and tasks inside a callout and (when available) embed.

1. Click a checkbox outside revealed source. Only the status character changes;
   labels, whitespace and prefixes remain. Save, undo and redo natively.
2. Run Toggle Checklist Status and Cycle List Checklist on multiple selected
   lines. A selection ending at column zero excludes that final line.
3. Edit the same task in another panel, then try an old rendered checkbox: a
   stale expected line must not overwrite the edit. Repeat for an embedded note.
4. Disable/re-enable Tasks: checkbox handlers, decorations, commands and the
   embedded-task RPC handler disappear and return. These commands' `verify`
   key bindings remain unbound pending the owner's Obsidian check.
