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
   Activate each definition back-reference button: it returns to the corresponding
   reference, including when one definition has multiple references.
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

## Embeds and media

Setup: copy files from `test/fixtures/media` into the disposable vault. Add full
note, heading and block embeds, an image with `|200x100`, WebM/audio, a PDF, a
missing target and a self-referencing note. Include tasks and footnotes in the
embedded note, with links relative to that note's folder.

1. Check full/section/block transclusion, dimensions, recursive embeds and the
   circular/depth fallback. Relative links must open from the embedded source.
2. Click an embedded task: only its source document changes. Reject stale task
   lines and verify dirty embedded text is read from the native TextDocument.
3. Inspect an image: fit/actual size, zoom buttons, +/−/0/1 keys, modified wheel,
   pan, close/Escape and restored trigger focus. Disable Embeds while it is open.
4. Play each WebM fixture, including audio, seek, and remove the embed or disable
   the plugin during loading/playback. No player, fetch or object URL remains.
5. PDF/file cards open the associated editor. HTTPS media is blocked in untrusted
   workspaces. A local symlink escaping the vault remains blocked in both modes.
6. Run Insert Embed on selected text and undo. Disable/re-enable Embeds: widgets,
   media, inspector, styles, nested render passes and command are removed/restored.
7. Check embedded footnote text/numbering and definition navigation separately;
   record any target mismatch in the acceptance notes.

## Page Preview

Setup: links in `Core.md` to a note, heading, block, image, PDF and missing target.

1. Hold Cmd/Ctrl over an internal link for 300 ms: a preview opens without
   changing the current document. Move into it; leaving dismisses after the delay.
2. Focus a rendered link and press Alt+Enter: focus moves into the popup. Escape
   or Close dismisses it and restores editor focus. Open uses the link's source
   folder, including links inside an embedded note.
3. Rapidly move between links or close while a resource loads: late results must
   not replace a newer preview. Edit the document: the preview closes.
4. Task controls inside previews are read-only. External schemes do not preview.
5. Disable/re-enable Page Preview while a popup or image inspector is open;
   pending timers, listeners and render passes disappear, then behavior returns.

## Properties

Setup: use a disposable copy of `test/fixtures/vault/Core.md`; add YAML with text,
number, checkbox, date, datetime, aliases, tags, a nested object and commented
values. Use two Workbench panels of that note.

- Add File Property (palette or Mod+;) creates a header if absent, focuses a new
  name, and rejects duplicates. Rename/delete rows; body and comments survive.
- Edit each scalar type, cancel with Escape, commit with Enter, blur, Mod+S and
  the native Save command. Invalid number/date drafts block saving. Verify one
  native undo restores each structural change and redo reapplies it.
- Keep a text draft focused (also during IME composition) while changing another
  row in the second panel. The draft stays connected; cancel reveals current YAML.
- Add/remove/edit chips, including duplicate source values. Edit the other panel
  before committing: the intended occurrence changes, unrelated items survive.
- Select rows with Shift/Alt, copy/cut, paste into another sheet, and paste malformed
  structured data. Valid data merges; malformed structured data never enters text.
- Sort A–Z/Z–A from the heading menu, then edit a row: order and value persist as
  one undo. Drag a type grip through scrolling, drop once, cancel with Escape;
  comments stay with entries and YAML anchor dependencies are protected.
- Choose property types and decline/accept conversion. Preferences persist on
  reload and are shared between panels in the same vault. Nested vault isolation
  awaits Phase 5 root discovery.
- Test visible/hidden/source display, Source mode, heading arrows/Space paging,
  row/chip keyboard navigation, and disabling/re-enabling Properties. Source YAML
  remains editable; no old menu, drag, dialog or shortcut survives disabling.
- Title focus from the heading awaits inlineTitle integration later in Phase 4.

## Tables

Setup: in a disposable copy of `test/fixtures/vault/Core.md`, use Insert Table,
then create enough rows to extend beyond the viewport; include Unicode, escaped
pipes, `<br>`, formatting, links, footnotes and missing trailing cells.

- Click rendered text and edit cells. Whitespace and escaped pipes remain valid
  Markdown; body text does not move unexpectedly. Tab/Shift+Tab traverse cells,
  Enter moves down, Shift+Enter inserts `<br>`, and boundary arrows leave the grid.
- Select a rectangle by dragging or Shift+arrows. Copy/cut/paste TSV, including
  a larger rectangle. Undo/redo use native history and restore the full operation.
  Copy for Agent must report cell source ranges once that plugin is delivered.
- Exercise every table palette/menu action: insert/delete/move rows and columns,
  alignment, sorting, duplicate, clear, format, and Edit Table Source. Arrow away
  from revealed source to render again; Source mode displays the full Markdown.
- Drag row/column handles while scrolling before one drop (the source's known
  intermittent scenario). Expect exactly one reorder; Escape, blur, pointer cancel
  and plugin disable must cancel the gesture without a source edit.
- Open a second panel; insert/delete a row while the first edits a cell. Its cell
  caret stays with the mapped source, or safely closes if that cell disappears.
  Read clipboard asynchronously while changing the selection: stale paste refuses.
- Enable Vim; cross from note to cell and back in insert and normal modes. Verify
  h/j/k/l boundary navigation, :w/:u/:red and native undo grouping. Toggle Vim and
  Formatting while a cell is active; text remains in the outer document.
- Disable/re-enable Tables: source replaces widgets; no menus, drag handlers or
  cell selection survives. Test Add File Property while a cell is focused.

## Composition fixes (§5.10) — owner acceptance, not run

Use `Core.md` in the disposable vault/profile described above. Enable lineNumbers
and Vim explicitly where indicated; both are disabled by default. Record the
final settings, result and any console errors for each scenario.

1. **Gutter order and fresh-start equivalence.** Enable lineNumbers and folding;
   fold a heading. Toggle lineNumbers off/on, then folding off/on, then repeat
   in reverse order. Expected: numbers always left of fold markers, one gutter
   of each kind, no duplicate commands. Disabling folding reveals all text;
   enabling restores its saved ranges. Reload at the same final settings and
   compare appearance with the toggled view.
2. **Live editor settings and independent panels.** Open Core.md twice; use
   distinct selections, scroll positions and folds. Set editor.useTabs=false
   and editor.tabSize=2, then true/8, then restore true/4. Insert/indent a list
   item and inspect its actual whitespace in the text editor. Expected: settings
   change without reopening, indentation guides and tab widths agree, selections,
   text and folds remain intact. Repeat with a second folder's resource override;
   only the affected resource uses that override. Toggle all features off/on:
   none may reset the chosen core tab settings.
3. **Folding reconfiguration without edits.** Add headings and an indented
   paragraph containing mixed tabs/spaces. Leave one section folded. Change
   folding.heading and folding.indent independently, without typing or scrolling.
   Expected: available gutter markers refresh immediately; current folded ranges
   remain folded and can be unfolded. Change tabSize and inspect indent-fold
   boundaries. Reload and compare the available markers at identical settings.
4. **Late feature state and panel isolation.** Use two views with different
   folded sections and normal/nested callout disclosure states. Disable folding
   and callouts, reload with them disabled, then enable them. Expected: each
   panel restores its own state; one feature's toggle does not clear the other's
   state. Repeat toggles without edits and confirm no duplicate disclosure
   listeners (one click changes state once). Schema rejection/unknown keys and
   explicit restore into mounted disclosures are covered by unit tests. Rename
   view-transfer UI acceptance remains blocked on the future inlineTitle unit.
5. **Renderer and key precedence.** Add a Mermaid fence, an ordinary code fence,
   math, a callout, footnotes and a table. Toggle diagrams/codeBlocks in both
   orders. Expected: Mermaid uses diagrams whenever enabled, general code only
   when diagrams is disabled; other widgets keep their feature renderer. Enable
   Vim and tables in both orders: cell Tab/Enter/boundary navigation still runs
   before Vim, and host save/undo keeps priority. Compare after reload.
6. **Every catalog feature/config.** Toggle each of tables, properties,
   pagePreview, embeds, tasks, footnotes, callouts, diagrams, math, codeBlocks,
   links, formatting, lineNumbers, folding, indentGuides, spellcheck, autoPair,
   smartLists and Vim off/on, then repeat a mixed order. Test the commands from
   its section. Expected: only the disabled feature's registrations disappear;
   no duplicates, stale processors or changes to unrelated folds. Change
   autoPair's two booleans, properties.display through all three values and
   links.folderNote/useWikilinks/newLinkFormat, ending at identical settings
   in a fresh panel. Compare behavior (link creation/index options still have
   their documented later-phase limits). Spellcheck must return to the editor
   default when disabled. Property draft behavior is also checked in its own
   section; switching to hidden/source intentionally removes the sheet UI.

These scenarios supplement the retired source cases; no retired test was revived
and the automated smoke suites were not expanded.

## Readability pass regressions

These are owner-run regression checks for behavior-preserving rewrites, not new
smoke scenarios. Use only the disposable fixture vault described above.

- **Tables:** rerun all seven steps in **Tables**, especially selection-to-source
  mapping, keyboard boundary movement, clipboard and menus, row/column dragging
  while scrolling, source disclosure, and Vim cell transfer. Repeat the
  **Composition fixes** table/Vim toggle-order checks. Open one fixture note in
  two panels, edit a cell, insert a row from the other panel, and confirm the first
  cell's caret and Vim mode survive. Start a menu paste, change the table or
  selection before the clipboard reply, and confirm stale text is rejected.
  Toggle tables off during rendering, then back on; no old render may overwrite
  the new cell editor. These scenarios have not been run by the agent.

- **Properties — chips and lists:** rerun the **Properties** list/chip, duplicate
  occurrence, pending draft, IME, structured clipboard and save-rejection cases.
  Edit a chip while a second panel inserts or removes an equal-valued item;
  commit must target the same occurrence or report that it disappeared. Move
  focus to another chip or the add-item input while committing; focus must follow
  the replacement DOM. Check Escape, Enter, Mod+S, blur, remove buttons and chip
  menus. Toggle Properties off/on with a chip menu open. Not run by the agent.

- **Properties — structural controls:** rerun property rename validation,
  chosen-type retention, single/multiple row menus, row removal and order commit.
  Test arrow/Tab and Vim h/j/k/l/i/A/o focus, Alt+Down to body, Mod+Backspace,
  undo/redo and save. Rename while saving and verify invalid or duplicate names
  block the operation; successful edits restore focus to the requested row.
  Reconcile a second-panel change while a type menu is open. Not run by the agent.

- **Properties — scalar drafts and transactions:** rerun checkbox changes,
  scalar number/date validation, Enter/Escape/blur/Mod+S and save rejection.
  Sort the sheet, then rename/edit/remove a row; one undo should restore both
  its value and the original source order. Repeat with two panels and stale
  headers. Change a property type, then change the source while its confirmation
  is open; the old confirmation must not convert the new value. Not run here.

- **Properties — sheet, selection and ordering:** rerun every remaining Properties
  scenario: add form and heading navigation, Shift/Alt row selection, structured
  copy/cut/paste, sorting and dragging with scroll/cancel, focused input/IME
  preservation during second-panel changes, and visible/hidden/source settings.
  Test recursive YAML aliases, tags, nested values and forced-type warnings.
  Repeat the composition tests for Properties config changes and off/on; existing
  folds, table state and unrelated extension order must survive. Not run here.

- **Page Preview:** rerun all **Page Preview** scenarios, including modifier
  delay, keyboard opening/focus, Escape, source/embedded link targets, attachment
  previews and read-only tasks. Hover a second link while the first request is
  pending, then close or disable the plugin; late results must not reopen the
  popup or retain render passes. Move focus into an image inspector and back.
  Restore focus to the editor after keyboard dismissal. Not run by the agent.

- **Native workbench adapter:** rerun **document and editor (Phase 3)** and
  **commands and resources (Phase 3)**, especially CRLF edits, save/undo,
  independent panels, active-group routing, resource URLs and config changes.
  The native smoke passed in an isolated profile; full owner acceptance is unrun.

- **Editor:** rerun **document and editor (Phase 3)** and all **Composition fixes**
  scenarios: two panels with distinct selections and scroll, version-checked view
  transfers, restore/reload with delayed image/math layout, settings updates,
  feature toggles and active-tab routing. Scroll/type during restore to cancel
  pinning. Keep folds/callout disclosures while changing indentation; verify
  projected table selections and clipboard. Native smoke passed; owner checks
  have not been run.

- **Footnotes:** rerun all **Footnotes** scenarios and the split-view undo
  regression. Check repeated/named/inline references inside prose, tables and
  embeds; numbering, popup keyboard focus, definition links and back-references
  must remain consistent. Disable Footnotes while a preview render is pending,
  then re-enable; stale controls must not survive. Not run by the agent.

- **Commands:** rerun **commands and resources (Phase 3)** plus the composition
  command-availability checks. Run save/undo/redo/close/Open as Text from keys and
  the palette; change the active group while flushing and verify the wrong panel
  is never edited or closed. Disable/re-enable a command-owning feature and switch
  between minimal/Obsidian panels; palette execution must respect current settings.
  No owner manual run has been performed.

- **Document:** rerun typing/save/undo, split-panel convergence, external edits
  and CRLF cases in **document and editor (Phase 3)**. Verify adjacent typing
  groups together, pausing/caret movement creates a new group, IME remains intact,
  and table/Vim edits retain explicit groups. Save with an invalid property draft
  must fail before transport; correcting it must allow save. Not run by the agent.

- **Math:** rerun all **Math** scenarios: inline/display reveal, both palette
  commands, selection/undo and formulas inside other rendered blocks. Disable
  Math or close the panel while MathJax loads; late output must not replace
  disposed content. Re-enable and verify rendering resumes. Not run by the agent.

- **Diagrams:** rerun all **Diagrams** scenarios, including multiple Mermaid
  fences, errors, theme/reveal and off/on. Close a panel or disable the plugin
  while its lazy render is queued; no late SVG may replace disposed content.
  Re-enable after an error and verify later diagrams still render. Not run here.
## Vault index and host views (Phase 5) — not run

Setup: copy `test/fixtures/vault` to a scratch folder and open that folder in an
isolated profile. Add `Projects/Plan.md` (`---\naliases: [Roadmap]\n---\n# Plan\n## Goals\nSee [[Core]].`),
`Archive/Plan.md` (empty), `Daily.md` (`[[Projects/Plan]] and [[Someday]]; mentions core here.`)
and `image.png` (any image). Run `Developer: Reload Window` once so indexing starts.

### Vault and link resolution

1. In `Core.md`, add `[[Plan]]`, `[[Archive/Plan]]`, `[[./Daily]]` and `![[image.png]]`;
   follow each. `[[Plan]]` names two notes, both one folder away, so it opens
   `Archive/Plan.md` (nearest folder first, then path order). Check that
   Obsidian picks the same note.
2. Rename `image.png` to `photo.png` in the Explorer outside VS Code (Finder):
   the embed becomes unresolved within a second; rename it back: it resolves.
3. Add `"Archive/"` to `markdownWorkbench.vault.excludedFiles`: `[[Archive/Plan]]`
   still opens (Obsidian keeps excluded files linkable), but the quick switcher no
   longer lists it.
4. Create `Sub/.obsidian/` and `Sub/Inner.md` with `[[Core]]`: from `Inner.md`,
   `[[Core]]` is unresolved (a separate vault). Remove the marker and reload: it resolves.
5. Close and reopen the window: links in an open note resolve immediately (warm
   start), before indexing finishes. With a large copy (`scripts/measure-vault.ts`
   for numbers), typing stays responsive while indexing runs.

### Backlinks and outgoing links

1. Open `Core.md`: the Explorer's **Backlinks** shows `Daily` is not listed under
   linked mentions but is under **Unlinked mentions** (it says "core"); `Projects/Plan`
   is listed under linked mentions with its line. The status bar reads "1 backlink".
2. Click a context line: the note opens with the caret at the link.
3. Edit `Daily.md` to link `[[Core]]` without saving: Backlinks updates within a
   second. Close without saving: it returns to the saved state.
4. **Outgoing Links** for `Daily.md` lists `Plan` under Links and `Someday` under
   **Not created yet**. Works the same with the note open in the text editor.
5. Turn off `markdownWorkbench.plugins.backlinks.enabled`: the view and status bar
   item disappear; turn it on: they return. Set `markdownWorkbench.preset` to
   `minimal`: all Phase 5 views disappear.

### Note Outline

1. Open `Projects/Plan.md` in Markdown Workbench: **Note Outline** shows Plan › Goals.
   Click Goals: the caret moves to that heading.
2. Move the caret through the note: the outline selects the current section.
3. Open the same note in the text editor: Note Outline hides; VS Code's own
   Outline lists the headings once (no duplicates).

### Quick switcher, word count and link updates

1. Run **Markdown Workbench: Quick Switcher**: an empty query lists recent notes.
   Type `road`: `Roadmap → Plan` appears; Enter opens `Projects/Plan.md`. Type
   `Someday`: choose it to create `Someday.md` (in the new-note folder). Type a new
   name and press Enter with no item selected: the note is created.
2. The status bar shows words and characters for the active note; select text:
   it counts the selection. Compare `日本語 text` (4 words) with Obsidian.
3. Add `[[Projects/Plan#Goals|goals]]` to `Daily.md`. Rename `Projects/Plan.md` to
   `Projects/Strategy.md` in the Explorer: a dialog asks "Update links in 1 file?".
   Accept: `Daily.md` now reads `[[Strategy]]` and `[[Strategy#Goals|goals]]`;
   `[[Plan]]` in `Core.md`, which points at `Archive/Plan.md`, is unchanged. One
   Undo reverts the rename and the edits together. Repeat declining: no note changes.
4. Rename the `Projects` folder: links to every file inside are updated. Set
   `markdownWorkbench.linkUpdates.mode` to `never` and rename again: nothing is asked.
5. Compare each scenario with Obsidian in a disposable vault and record differences.

- **Callouts:** rerun all **Callouts** and disclosure composition scenarios.
  Click titles and nested links, toggle using keyboard disclosure controls,
  restore two panels with different disclosures, and rename/reopen. Disable
  Callouts with rendered disclosures mounted; old listeners must disappear and
  re-enable must restore per-panel memory. Not run by the agent.

- **Tasks:** rerun inline, rendered and embedded checkboxes plus both checklist
  commands. In a second panel change the expected task line before toggling;
  a stale edit must be rejected. Check read-only footnote previews and truncated
  embeds; disable/re-enable Tasks while controls are mounted. Not run here.

- **Formatting:** rerun all formatting commands and composition command checks.
  Toggle at a caret inside formatted text, on a plain word, with delimiters
  selected, and across multiple selections. Repeat in table cells and read-only
  views; confirm list numbering, heading removal, line moves and undo. Not run here.

- **Code Blocks:** rerun highlighted fences, indented code, Copy and click-to-
  source scenarios. Select the final fence character and the following line start;
  verify reveal/highlighting boundaries. Type with IME, scroll between fences,
  and disable/re-enable while Prism loads. No stale controls should remain.
  Not run by the agent.

- **Vim:** rerun all Vim and table mode-transfer scenarios. Exercise `:w`, `:q`,
  `:wq`, `:x`, `:u`, `:red`, host shortcut consumption, normal-mode IME and
  insert-mode selection. Disable/re-enable and confirm native hooks restore
  and stopped Ex callbacks cannot act. Not run by the agent.

- **Rendered Content:** rerun core rendering, Math, Diagrams, Code Blocks, Embeds
  and Footnotes scenarios in trusted and untrusted workspaces. Dispose a widget
  during preprocessing/lazy loading and verify stale content cannot overwrite its
  replacement. Confirm remote media/iframes follow trust. Not run by the agent.

- **Resources:** rerun contained resources, nested embeds, previews and unsaved
  embedded-note edits. Confirm relative nested links and mtime URLs, refusal of
  unknown source identities, realpath escapes and virtual symlinks. Not run here.

- **Editor menus:** rerun table and property menus, including nested submenus,
  disabled entries, Arrow/Home/End, Escape/Tab, outside click, blur and command
  errors. Verify focus restoration and right/bottom viewport placement; dispose
  the owning widget while a menu is open. Not run by the agent.

- **Links:** rerun rendered/source/modifier/side clicks, selection gestures,
  local fragments, initial navigation, embedded-note identities and all three
  commands. Change link settings without reopening; disable/re-enable during
  initial RPC. Confirm external-scheme prompts and unsafe-scheme rejection.
  Not run by the agent.

- **Native navigation:** rerun link opening/creation, configured new-note folders,
  folder notes, Explorer folder reveal, side opens and fragments/offsets. Check
  local symlink escapes, missing parent paths and virtual-filesystem symlinks.
  The navigation contract remains unchanged. Not run by the agent.

- **Live Preview:** rerun core reveal/source-mode, structural motion, custom
  renderer toggles, rendered click placement, IME and mouse-drag selection.
  Include nested emphasis, Markdown links, headings, quotes and task/list markers.
  Restore a Source-mode panel and toggle features in different orders; identical
  settings must give identical renderer priority. Not run by the agent.

- **Embeds — image inspector:** rerun image open/close, fit/actual size, zoom
  buttons/keys, Ctrl/Mod-wheel focal point, pan, resize and remembered scale.
  Close while loading or panning; observers/listeners must stop and focus return
  to the trigger when appropriate. Not run by the agent.

- **Embeds — WebM recovery:** rerun the VP8/VP9/audio WebM fixtures and ordinary
  media controls. Close/disable during fetch, source-open and buffer append;
  object URLs/readers/listeners must be released. Verify first playback after
  Opus preroll and visible unsupported/truncated-media errors. Not run here.

- **Embeds — pass lifecycle:** rerun note/heading/block transclusion, cycles,
  embedded tasks/links/footnotes, remote trust, attachments and Insert Embed.
  Disable while a resource or nested note render is pending; late passes must
  dispose, media must stop and original placeholders must return. Not run here.

- **Remaining README audit:** rerun the existing Auto pair, Folding, Indentation
  guides, Line numbers, Smart lists and Spellcheck scenarios. Check independent
  pair flags, fold retention after tab-width/config updates, gutter order after
  toggles, list Enter/Backspace and spellcheck host behavior. Dialect consumers
  use the same syntax in notes, embeds and metadata. These are documentation
  clarifications, not new feature behavior; owner acceptance remains unrun.

## Inline title (Phase 4)

Use a disposable copy of `test/fixtures/vault/Core.md` (never an owner vault).

- Enable/disable Inline title. It appears above Markdown in Live Preview and
  Source mode without becoming document text; off/on leaves folds and scroll
  intact. Repeat with the catalog composition toggle scenarios.
- Rename using Enter, Tab and blur; whitespace trims, empty/Escape restores the
  confirmed name. Type using IME and move focus during composition: commit only
  after composition ends. A pending rename makes the title read-only/busy.
- Try an existing filename, a separator, colon, newline and >255 characters.
  Rename must fail without replacing another file. A focused invalid title shows
  an error; leaving it restores the confirmed title. Untitled/non-file notes refuse.
- Down on the title's last visual line focuses Properties; Alt+Down focuses body.
  Shift+Tab/Up from Properties focuses/selects the title, including after scroll.
  With Properties hidden/off or in Source mode, navigation falls back to body.
- Open the same note in two editor groups. Give them different selections,
  scroll, mode, folds and callout disclosures. Rename with one active: each group
  reopens the new file and restores its own state; only the intended group focuses.
  Repeat a long/backward selection and a Properties focus destination.
- Edit from the other group while rename capture is pending: reject a stale
  capture. Rename through Explorer and reopen: the title reflects the current
  filename. Verify configured incoming-link updates through the separate Link
  Updates plugin. Save/undo remain native operations.

These scenarios are documented, not run by the agent. The existing native smoke
only proves boot, typing, save and undo; it does not substitute for rename testing.

## Tags (Phase 4 editor/search)

In a disposable copy of `Core.md`, add `#project`, `#Project/notes`, a Unicode tag,
and YAML `tags: [project]`; create a second fixture note with `#projectile`.

- Click rendered tags in prose, a callout, table, footnote and embedded note.
  A native picker lists matching notes; parent tags include descendants regardless
  of case, but `project` does not match `projectile`. Selecting opens the note.
- Code, escaped hashes, comments and numeric-only tags remain literal. Caret
  reveal shows source; disabling Tags removes inline widgets and click handlers.
  Re-enable and verify other feature order/state remains unchanged.
- Edit a YAML/inline tag in another panel and wait for indexing; repeat the
  search. Excluded notes must be omitted. No new whole-workspace scan occurs.
- Disable Tags while a picker is open; selecting a stale result must not open it.
  Native hierarchical Tags view scenarios belong to Phase 5.

These scenarios are documented, not run by the agent.
