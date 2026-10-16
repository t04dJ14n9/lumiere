# Manual acceptance plan

The owner runs these scenarios, by hand or with computer use, against the
packaged VSIX. Automated tests do not count as manual acceptance or as
Obsidian parity; record parity in `docs/PARITY.md`. The plan is ordered by
plugin. Every command and setting also appears in the inventory at the end.

## Setup

### Build and install into an isolated profile

Never install the extension into an existing VS Code or Cursor profile, and
never open a real vault.

1. Build the VSIX: `pnpm install && pnpm package`. It writes
   `vscode-markdown-workshop-<version>.vsix` in the repository root.
2. Copy the fixture vault: `cp -R test/fixtures/vault /tmp/mdwb-vault`.
3. Install into a throwaway profile and open the vault:

   ```sh
   code --user-data-dir /tmp/mdwb-manual/user \
        --extensions-dir /tmp/mdwb-manual/extensions \
        --install-extension vscode-markdown-workshop-0.1.0.vsix
   code --user-data-dir /tmp/mdwb-manual/user \
        --extensions-dir /tmp/mdwb-manual/extensions /tmp/mdwb-vault
   ```

   For Cursor use `cursor` with the same flags. Delete `/tmp/mdwb-manual`
   and `/tmp/mdwb-vault` afterwards.
4. Run **Markdown Workshop: Use Markdown Workshop for Markdown in This
   Workspace** once, so `.md` files open in Workshop (see Editor below).
5. Turn on `markdownWorkshop.debug.logging` while testing and keep the
   **Markdown Workshop** output channel open; note any error lines in the
   result.

Change settings at workspace scope (or folder scope in a multi-root
workspace), so the profile's user settings stay clean, and reset each
override after its scenario.

### The fixture vault

`Welcome.md` lists the notes. Each covers one area: `Core.md` (editing,
folding, formatting commands), `Formatting.md` (inline syntax, headings,
quotes, lists, comments), `Links.md`, `Embeds.md`, `Properties.md`,
`Tables.md`, `Callouts.md`, `Math.md`, `Diagrams.md`, `Code.md`,
`Footnotes.md`, `Tasks.md`, `Tags.md`, `Search.md`, and `Target.md` (the
note most others point at). `notes/` and `archive/` each hold a
`Duplicate.md`; `attachments/` holds an SVG, a WebM video and a PDF. The
`.obsidian` folder marks the vault root.

### For every plugin

Unless the section says otherwise, also check:

- **Off and on.** Turn `markdownWorkshop.plugins.<id>.enabled` off with
  the note open: the plugin's rendering, commands, keys and views disappear;
  text, selection, undo history and other plugins' state stay. Turn it on:
  everything returns once, with no duplicates.
- **Two panels.** Open the note in two editor groups: selections, scroll,
  folds and disclosure states stay independent (Properties collapse is shared); edits appear in both.
- **Source mode.** Toggle Live Preview/Source: Source shows plain Markdown
  with no widgets.
- **Undo.** Every edit the plugin makes is one step in VS Code's undo.
- **Obsidian.** Where a step says "as in Obsidian", compare with Obsidian
  on a copy of the same vault and record the result in `docs/PARITY.md`.

The undo requirement above is an acceptance target. Earlier native table tests
only established whole-table integrity and final restoration. The diagnosed
duplicate-shortcut path and pending native granularity verification are recorded
in [tables-diff.md](tables-diff.md); do not mark this requirement passed from
those weaker checks alone.

The `minimal` preset (`markdownWorkshop.preset`) loads only the core
plugins; switching the preset takes effect for newly opened editors.

## Core plugins

### document

Owns the text, saving and history; VS Code's TextDocument is the authority.

1. In `Core.md`, type ASCII, CJK with an IME, emoji and several lines; save;
   undo and redo; run Save and Close, then reopen. Text and disk agree, IME
   characters are not duplicated, save includes pending edits, and undo/redo
   follow VS Code's history. Typing without pausing undoes as one step;
   moving the caret starts a new one.
2. Split `Core.md` into two Workshop panels and open it as text in a third
   group (**Open as Text**). Edit in each; undo from another. All three show
   one document. Edit the file on disk while it is saved: the editors reload
   it without losing newer text.
3. Save a copy of `Core.md` with CRLF line endings (text editor status bar).
   Edit across lines in Workshop, save and undo: the file stays CRLF and
   selections do not drift.
4. Reload the window with unsaved changes: VS Code's hot exit restores them.

### editor

The CodeMirror view in a webview panel, its commands and view state.

Cursor Remote SSH handoff regression (use the disposable vault): associate
`*.md` with Markdown Workshop and leave both `editor.warmTextDocument` and
`editor.reclaimTextEditor` at `auto`. Have an agent edit a note on disk, open
it with Cursor's built-in Markdown editor, and make an unsaved edit there.
Let Cursor auto-transfer the note into Markdown Workshop, then repeat with
**Reopen Editor With… → Markdown Workshop**. The custom editor opens without
the `Argument is 'undefined' or 'null.'` assertion, the unsaved text survives,
and native undo still restores the edit. Repeat with a `.markdown` note and
the matching association, and after reloading with the dirty note already
open. **Open as Text** still keeps the text editor during the bypass window.
Setting warming to `off` must stop warm calls; record the Cursor result
separately, since that explicitly disables the workaround.

1. Copy, cut and paste Markdown with the keyboard; paste into a text
   editor: the exact source is copied.
2. Give two panels different selections, scroll positions and modes; reload
   the window: each panel restores its own state.
3. Run **Use Markdown Workshop for Markdown in This Workspace**: the
   workspace `settings.json` gets `workbench.editorAssociations` entries for
   `*.md` and `*.markdown`, other associations stay, and running it again
   changes nothing. A note opened from the Explorer now opens in the
   Workshop editor. **Open as Text** still opens the text editor.
4. Run **Note Actions** and **Selection Actions** from the palette (with and
   without a selection): a quick pick lists the registered actions.
5. Change `markdownWorkshop.editor.readableLineLength`,
   `markdownWorkshop.editor.rightToLeft`, `markdownWorkshop.editor.useTabs`
   and `markdownWorkshop.editor.tabSize` with the note open: the editor
   updates without reopening and keeps text, folds and selection.
   `markdownWorkshop.editor.defaultMode` applies to newly opened panels.
6. With `markdownWorkshop.debug.logging` on, the **Markdown Workshop**
   output channel shows debug lines from the host and the webview; with it
   off, only warnings and errors.
7. Right-click a selection that spans hidden syntax (bold, a link): the
   menu has Cut, Copy and Paste. Copy and Cut put the exact source on the
   clipboard; Paste of a copied web page section arrives as Markdown, as
   Mod+V does. Right-click in a table cell or a property chip: their own
   menus open instead.

8. Copy `Core.md` repeatedly into a disposable long note (at least 300 lines).
   At the default `markdownWorkshop.editor.dragScrollSpeed: 4`, drag a text
   selection to within 6 px of the top/bottom viewport edge and hold the
   pointer still: scrolling and selection extension continue, substantially
   faster than setting 1. Drag farther past the edge: speed increases. Try
   1, 2.5 and 10 with the note open, including changing speed during a held
   drag; text, selection anchor and folds survive. Repeat in Source mode,
   with Shift-click extension and double/triple-click word/line selection.
   Release inside/outside the webview, switch windows, and start dragging
   existing selected text: extra scrolling stops. Open the same note in two
   panels: only the pane where selection started scrolls. Confirm table
   selection/handle drags and property reordering keep their prior behavior.
   Reset the setting afterwards. Human assessment of the default feel is
   part of this owner-run scenario.

### dialect, render and livePreview

The Markdown syntax, the HTML renderer and Live Preview's reveal-at-caret.

1. In `Formatting.md`, move the caret into and out of each emphasis,
   heading, quote and list: syntax shows only where the selection touches.
   The `# ` of a heading shows only on its line. The setext heading keeps its
   `---` underline visible, faint. `%%comments%%` stay visible, faint (as in
   Obsidian, which hides them only in Reading view). A nested quote draws a
   second, indented bar.
2. In `Core.md`, click Edit on the code and HTML blocks, edit, press Escape;
   move with ArrowUp/Down over a rendered block: the block is crossed as one
   unit. Repeat with a block at the end of the file.
3. Switch Live Preview/Source repeatedly and edit quickly: no duplicate
   widgets or stale output.
4. Copy `Core.md` into an untrusted workspace (**Workspaces: Manage
   Workspace Trust**) and add a `<script>`, an `onclick` attribute, an
   `<iframe>` and a remote image. Nothing executes and no remote content
   loads; typing and saving still work. Links with application schemes
   (`obsidian://`, `zotero://`) stay links in rendered blocks.
5. `markdownWorkshop.editor.strictLineBreaks` on: single newlines in
   rendered blocks no longer break lines.

### commands

1. Run Save, Undo, Redo, Close, Save and Close, Open as Text and **Toggle
   Live Preview/Source Mode** from the palette, then save/undo/redo with
   their keys. Each acts on the active panel and flushes pending edits first.
2. Change the active editor group while a command runs: the wrong panel is
   never edited or closed.

### resources and vault

Contained file access and the vault index (Obsidian's metadata cache).

1. In `Links.md`, follow `[[Duplicate]]`: it opens `archive/Duplicate.md`
   (nearest folder, then path order), as in Obsidian. From
   `notes/Project plan.md`, `[[Duplicate]]` opens `notes/Duplicate.md`.
2. Rename `attachments/diagram.svg` outside VS Code: its embeds in
   `Embeds.md` become unresolved within a second; rename it back.
3. Add `"archive/"` to `markdownWorkshop.vault.excludedFiles`: links to it
   still open, but the quick switcher and search no longer list it.
4. Create `Sub/.obsidian/` and `Sub/Inner.md` containing `[[Target]]`: it is
   unresolved there (a separate vault). Remove the marker and reload: it
   resolves. `markdownWorkshop.vault.rootMarkers` changes which folders
   mark a vault.
5. Create a symlink in the vault pointing outside it and embed it: it is
   refused. So are paths with `..` that leave the vault.
6. Close and reopen the window: links resolve immediately (saved index),
   before indexing finishes.

### Plugin management

1. Run **Manage Plugins**: Settings opens filtered to the plugin switches.
2. Run **Show Plugin Status**: every plugin of the active editor is listed,
   failed and waiting ones first, each with its state and kind; choosing
   one opens its switch.
3. With the sample plugin installed (see External plugins),
   `markdownWorkshop.plugins.external` holds its switch; turning it off
   stops it in every panel.

## Feature plugins

### properties

`property.md`, `Properties.md`, a new note without YAML, and two panels.
Reference: the measured Obsidian 1.14.4 spec and `docs/properties-diff.md`.

1. Text and typed values are immediately editable; no generic Edit button.
   Text has an Empty placeholder, numbers accept decimals, checkbox click/Space
   writes a boolean, and native date/date-time controls are visible. Type icons
   are text, binary, check-square, calendar, clock, list, tags and forward
   (aliases). Exact wikilinks show an internal link and a pencil to edit it.
   Confirm the layout in both light and dark themes and with a narrow panel.
2. From a key input: Tab goes to value, another Tab to that row, then Tab to the
   next row. Enter in a key commits the rename and focuses its value (the pill
   input for lists); Enter in text/number commits and focuses the row. Focused
   rows use Up/Down, Delete removes, Backspace does not, Escape returns to the
   document. Check the last-row/document boundary and Shift+Tab too.
3. **Add File Property** (palette or Mod+;) appends an inline draft and focuses
   its key. Vault-wide name suggestions filter `st` to `status`/`list`; Enter
   accepts the name and focuses the known-type widget. YAML gets `name:` only
   after a valid name. On a note with no YAML, opening a draft and Escape make
   no text/undo change. Escape retains the draft row. Empty or duplicate
   additions/renames retain the typed key, leave YAML unchanged, and show no
   notice. Rename between known names without changing either type preference.
4. List/tag/alias input + Enter adds a pill and keeps focus there. Empty-input
   Backspace focuses the last pill, then Backspace removes it. Enter on a pill
   edits it; x removes it. Tags drop one leading #. Repeat with pending entries,
   duplicate occurrences, IME, and a concurrent list edit from the other panel.
5. Keep a text draft focused (including IME) while the other panel changes
   another row: its element and draft stay. Enter/blur/Mod+S commit. Escape
   cancels the scalar draft and returns to the document. Invalid typed values
   block save; undo restores each actual YAML edit in one step. Rich paste in
   a property inserts plain text into that field, never also into the body.
6. Icon click and row context menu show Property type >, Cut, Copy, Paste,
   Remove. Type submenu: Automatic (inferred), Checkbox, Date, Date & time,
   List, Number, Text, with current preference checked. All choices for tags,
   aliases and cssclasses are disabled. Heading menu: Add file property,
   Sort > Name (A to Z)/Name (Z to A), Clear file properties. Select/copy/cut/
   paste rows, including malformed clipboard input, and verify one undo per
   structural edit. Sort/drag preserve comments and YAML anchors; drag through
   scrolling and drop once, Escape cancels a drag.
7. Set `status: draft` to Number: the widget and mismatch warning change,
   YAML and undo history do not, and no conversion dialog appears. Focus/blur
   the mismatched empty number widget and save: `draft` must remain intact.
   Create `status` in the other note: Number applies there too. Automatic clears
   the registry entry; reopen and check inference. Repeat with two panels and
   a separate vault to verify vault type isolation.
8. Click the heading to collapse. Both panels and other notes share that state,
   including notes in a second vault in the same workspace. Reopen/reload the
   workspace and check persistence. Expanding restores the values; Mod+;
   expands the sheet and opens a draft. Other plugin disclosures remain per panel.
9. `markdownWorkshop.properties.display`: visible, hidden, source. Off/on and
   source/live-preview toggles keep the native document authoritative. Check
   menu clipboard permissions, native pickers/locales and actual IME with the
   owner's editor; these are not established by the DOM event unit fakes.
10. Keep `title` as an ordinary editable text property (WorkVault uses the
    filename stem). Add `decision_confidence_and_supporting_evidence: high` and
    a nested `decision_conf` map with `score`, `rationale` and a `factors` list.
    Add a list of maps too. Each complex value has an editable YAML textarea;
    click blank row/value space and type immediately. Plain text stays inline,
    lists retain pills and a trailing editor, and long keys stay within their
    column with the full name on hover. Repeat in a narrow panel.
11. Define `factors: &f [evidence, risk]`, then use `factors: *f` inside
    `decision_conf`. Its YAML editor must show the resolved list and permit a
    score edit. Commit with Ctrl/Cmd+Enter, save/reopen and undo; unrelated YAML
    stays intact. Unsupported tagged/recursive values show a clear Source mode
    message. Sources retains stacked rows above its YAML editor, including
    `sources: []`; source links still open, and selecting source ids still copies.

Daily-note links are deferred because this editor has no daily-note plugin;
per-note collapse (as in Obsidian) and native picker appearance are deliberate limits.

### inlineTitle

Off by default: first check that line 1 is at the top of a note with no
title, then set `markdownWorkshop.plugins.inlineTitle.enabled` to true.

1. The file name shows above the note in both modes, not as document text.
2. Rename with Enter, Tab or blur; Escape or an empty title restores it.
   Names with `/`, `:`, newlines, over 255 characters, or of an existing
   file are refused without touching other files.
3. With two groups on the note, rename: both reopen the new file with their
   own selection, scroll, mode, folds and disclosures.
4. Down from the title focuses Properties; Alt+Down focuses the body;
   Shift+Tab/Up from Properties returns to the title.

### links

`Links.md`.

1. Off the caret, a wikilink shows its label; a plain click follows it.
   With the caret in its source, a plain click edits and Mod-click follows;
   Mod+Alt-click opens it to the side. Selecting across a link does not
   follow it.
2. Follow heading, block (`#^key-point`) and same-note links: the target
   scrolls into view. **Follow Link** and **Open Link to Side** work with
   the caret in link syntax.
3. `[[Missing note]]` is dimmed; clicking creates and opens the note (in
   `markdownWorkshop.files.newNoteFolder` when set). `[[Home]]` stays
   unresolved (an alias is not a file name), as in Obsidian.
4. HTTPS and mail links open externally; `obsidian://` asks first.
5. **Insert Wikilink** wraps the selection; undo restores it.
6. `markdownWorkshop.links.folderNote` sets the note a folder link opens.
   `markdownWorkshop.links.newLinkFormat` and
   `markdownWorkshop.links.useWikilinks` shape links inserted by
   suggestions and link updates.

### embeds

`Embeds.md`.

1. The image renders at width 200, the Markdown image at natural size, the
   video plays (with sound and seeking), the PDF shows a card that opens
   the PDF, `![[Target]]` and the `Next steps` section render, and the
   missing file shows a placeholder. A note embedding itself stops at the
   depth limit.
2. Click an image: the inspector opens. Fit/actual size, zoom buttons,
   + − 0 1 keys, Mod-wheel, pan, Escape; focus returns to the image.
3. Tick a task inside the embedded `Next steps`: only
   `notes/Project plan.md` changes. Links inside embeds open relative to
   the embedded note.
4. In an untrusted workspace, remote images do not load.
5. **Insert Embed** wraps the selection; undo restores it.

### onlineVideos

`Videos.md`.

1. Each image-style YouTube and Bilibili link shows a card. The Bilibili
   card shows its cover, the video's title (no alt text) or the alt text,
   and `Bilibili · 英雄联盟 · 4:17`; YouTube cards show the still, and the
   card without alt text shows the oEmbed title and channel. The link in
   text stays a link.
2. **Open on YouTube** and **Open on Bilibili** (and clicking a cover) open
   the video page in the external browser (the second YouTube card at 42 s).
3. Offline (or with the providers blocked), reopen the note: cards show the
   alt text or provider and ID, with no errors.
4. No card offers **Play here**. Set
   `markdownWorkshop.onlineVideos.bilibiliPlayer` to true: the Bilibili
   card offers it and shows the player; note whether the video plays (it
   did not buffer in VS Code 1.141 on Linux). Reset the setting.
5. Put the caret on a video line: the Markdown shows; move away: the card
   returns.
6. In an untrusted workspace the cards have no cover, still, fetched title
   or Play here, and a note says so; no request reaches either provider.

### pagePreview

1. Hold Mod over an internal link in `Links.md` for about 300 ms: a preview
   opens; moving into it keeps it, leaving closes it.
2. Focus a rendered link and press Alt+Enter: focus moves into the preview;
   Escape closes it and returns focus.
3. Move quickly between links: a late preview never replaces a newer one.
   Editing the note closes the preview. Tasks in previews are read-only.

### tables

`Tables.md`.

1. Click the cell with bold and italic text: all its inline Markdown stays
   visible, even after moving the caret past the formatting. Only that cell
   shows source; focus elsewhere restores its render. Live Preview never
   reveals the entire table; Source mode does.
2. Tab/Shift+Tab wrap between rows. Tab in the final cell appends one row;
   Enter in the final row appends one row in the same column. ArrowDown at the
   bottom leaves without adding a row; ArrowUp from the adjacent line returns
   to the last row in the same column. Left/Right cross cells only at text edges.
3. Type `x|y\z`, spaces and Markdown in differently aligned cells; each edit
   rewrites aligned source, expands delimiters and stores the pipe as `\|`.
   Native undo restores the edit and its padding together. Keep Shift+Enter's
   existing `<br>` behavior; compare it separately because the probe did not
   verify that behavior in Obsidian.
4. Select a range by dragging or Shift+arrows; copy, cut and paste TSV.
   One undo restores each operation. Click a column grip, press Cmd+C on macOS
   or Ctrl+C elsewhere, and paste into a spreadsheet: the header and each body
   cell occupy separate rows. Repeat with a row grip, a rectangle and a single
   selected cell; TSV preserves the rectangle with tabs between columns and
   newlines between rows. Copy keeps the selection, focus and note unchanged.
   Select only text inside a cell and copy: only that text reaches the clipboard.
   One undo restores each operation.
   Include inline code (for example `git.tencent.com`), bold, links and inline
   math in selected header and body cells. In dark and light themes, the blue
   tint continues through code without opaque holes; all text stays readable.
   Move or clear the selection: unselected code regains its theme background.
5. Run **Insert Table** and every **Table:** command (insert, delete and
   move rows and columns, align, sort) from the palette and the menu.
   The cell menu has all Row/Column actions, with impossible moves disabled,
   both sort directions, plain-text Paste and Select all (cell text or grid).
6. The add-row + is below the focused table; the add-column + appears beside
   it on hover. Each adds one row/column and focuses its new cell. Compare the
   clicks separately: the Obsidian probe did not verify their effect.
7. Drag a row and a column handle while scrolling; drop once: exactly one
   move. Escape cancels a drag.
   Each header/first-column cell has its own grip. A plain grip click selects
   the axis without opening a menu; Enter and right-click expose its actions.
8. With Vim on, move between note and cells in normal and insert mode. Repeat
   with two panels, IME and external cell edits; selection and typed whitespace
   survive aligned rewrites without creating a second history.
9. In a disposable copy, use a header cell `每个环境共用 hello中文 café`,
   followed by `next word`; include an empty body cell and `last,value`.
   In normal mode, `w` visits offsets 7 and 15, then the next cell at zero;
   `e` first reaches the final character of each word. `w`/`W`, `e`/`E`,
   `b`/`B` and `ge`/`gE` cross cells and wrap rows, skipping empty cells.
   Counts span cells; WORD motions include punctuation. At the table edges,
   repeated motions stop without edits. Check `dw` and visual `vw` remain in
   their current cell, and insert-mode letters still type normally.
10. In a disposable note, put a wide, many-row table between several screens
    of prose. Select a middle row with its grip and release the pointer. With
    the pointer over the selected cells, wheel/trackpad up and down: the note
    scrolls in both directions while the row stays selected. Repeat with Vim
    in NORMAL mode, a selected column, a rectangle and an active cell editor.
    Horizontal trackpad and Shift-wheel gestures move the table horizontally
    without moving the note vertically. Drag selections and grips near all
    four visible edges: vertical note and horizontal table EdgeScroll still
    work; release stops auto-scrolling. Cell edits, handles and menus still work.

### callouts

`Callouts.md`.

1. Titles, icons, bodies, nesting and the default fold states match
   Obsidian. Click a foldable title to toggle; reload: each panel keeps its
   own state. Clicking the link in a title follows it without folding.
2. With the caret inside, the source shows and edits normally.
3. **Insert Callout** wraps the selected lines; one undo removes it.

### math

`Math.md`.

1. Formulas render; the caret reveals only the formula it is in. `$5 and
   $10` is not math. Invalid TeX shows an error and the note stays
   editable.
2. **Toggle Inline Math** twice round-trips the selection; **Insert Math
   Block** inserts a block.

### diagrams

`Diagrams.md`.

1. Both diagrams render; the invalid one shows an error and stays
   editable. The theme follows VS Code's light or dark theme.
2. Turn the plugin off: the fences show as code; on: they render again.

### codeBlocks

`Code.md`.

1. Fences are highlighted with a language label and, on hover, a Copy button
   in the opening fence line; Copy yields the code without fences. Clicking a
   token places the caret at that character.
2. Moving the caret into and out of each block moves no line: only the fence
   text appears and disappears. Typing in a fence keeps highlighting; the
   unlabelled fence, indented code and tilde fence stay readable.

### footnotes

`Footnotes.md`.

1. References show as superscript numbers in the text colour, LaTeX paper
   style (not Obsidian's look, by owner decision): `[^1]` is 1, `[^note]` 2,
   `^[Inline text]` 3 and the repeated `[^1]` 1 again, tight against the
   word. Inside a rendered block (table, callout) they look the same. A
   selection over them, Ctrl+A included, keeps the numbers; a caret inside a
   reference shows its faint source, and moving away renders it again.
   Hovering or focusing one previews the rendered footnote; Escape closes
   it. Clicking jumps to the definition (an inline footnote puts the caret
   in itself).
2. Definitions show the same number before their text, a little smaller
   than the note; with the caret on the marker, the faint `[^label]:`
   source shows. The indented continuation belongs to the same footnote.
3. **Insert Footnote** adds a fresh label at the caret and a definition at
   the end; undo removes both.
4. With two panels, insert in one and undo there: both converge with no
   extra undo step.
5. References inside a callout or an embedded note behave the same.

### tasks

`Tasks.md`.

1. Click checkboxes: only the status character changes. Checked tasks
   (`[x]`, and custom statuses like `[/]` and `[-]`) show a ticked box and
   muted, struck-through text, the same in the note and in the embedded
   `Next steps`, as in Obsidian's default theme. Each task's line and
   checkbox carry `data-task`, so a CSS snippet can style custom statuses.
2. **Toggle Checklist Status** and **Cycle List Checklist** act on all
   selected lines; a selection ending at column zero excludes that line.
3. Change a task in the other panel, then click the stale checkbox: the
   edit is refused.

### tags

`Tags.md`.

1. Inline and YAML tags render as tags; `#123`, the URL fragment and
   `#code` do not. Clicking a tag lists the notes using it; `#idea` and
   `#Idea` are one tag; a parent tag includes its children.
2. The Explorer's **Tags** view nests `area › tags › nested` with note
   counts. `markdownWorkshop.tags.viewSort` (`name`, `frequency`) and
   `markdownWorkshop.tags.viewNested` change it. Typing a new tag without
   saving adds it within a second.

### suggest

1. Type `[[Tar`, `[[Target#`, `[[Target#^` and `#ar` in any note: notes,
   aliases (`[[Ho` suggests `[[Welcome|Home]]`), headings, blocks and tags
   are offered; Enter inserts without duplicating `]]`.
2. Suggestions do not open in code, headings or frontmatter.

### search

`Search.md`.

1. Each `query` block lists matching notes; the invalid query shows an
   error. Edit a matching note without saving: results refresh.
2. Turn the plugin off: the blocks show as code.

### outline

1. With a Workshop note active, the Explorer's **Markdown Outline** lists its
   headings; clicking one moves the caret there, and the current section is
   selected as the caret moves.
2. In the text editor, Markdown Outline hides; VS Code's Outline lists headings
   once.
3. Use **Collapse All** in Markdown Outline's title bar, then **Expand All**.
   All branches expand, including a note nested from `#` through `######`.
   Expand All preserves the selected item without focusing a heading.
4. Open the title's **...** menu. **Follow Cursor** starts checked. Turn it
   off, move the caret between sections and click a heading: the selection
   no longer follows movement, while the click still navigates. Reload the
   window and confirm the setting stays off. Turn it on and confirm the
   current section is selected immediately, with focus remaining in the note.
5. With following on, switch notes and switch between two panels of the same
   note with different cursors. Edit or add a heading, hide and show the view,
   and confirm it selects the current panel's section after each change.
   A selection extending across sections follows its active end. Also check
   a CRLF note and a caret in the preamble before its first heading.
6. Press **Ctrl+Shift+O** (**Command+Shift+O** on macOS), or run **Markdown
   Workshop: Go to Heading…**. The Quick Pick shows parsed heading titles,
   levels and parent titles in document order. Search a title and accept it:
   the active Workshop panel navigates to that heading. Escape does not move
   the caret. Check duplicate titles, quoted headings, Setext headings,
   unsaved heading edits and a note with no headings. Fenced code and
   frontmatter content do not appear as headings.
7. Open the same note in a plain text split and switch repeatedly between
   the two panels without editing. Workshop's shortcut opens Go to Heading;
   the plain text shortcut and native Outline show built-in Markdown symbols
   once. Workshop uses Markdown Outline; it does not populate the native Outline
   or breadcrumbs. An open heading picker must not jump if the document is
   edited or a different panel becomes active before accepting it.
8. Press **Ctrl+Alt+O** (**Control+Command+O** on macOS) twice: Markdown Outline
   hides, then reappears and receives focus. Use **Move View** to place Markdown
   Outline in the secondary sidebar, then in the panel, and repeat. Each
   toggle targets Markdown Outline at its current location and leaves the other
   views visible. Also check a container containing only Markdown Outline.

### backlinks and outgoingLinks

Both are off by default (owner decision). Turn on
`markdownWorkshop.plugins.backlinks.enabled` and
`markdownWorkshop.plugins.outgoingLinks.enabled` first.

1. Open `Target.md`: **Backlinks** lists Links, Welcome and Search with a
   context line each, and **Unlinked mentions** lists notes that mention
   "Target" without linking. The status bar shows the backlink count.
2. Click a context line: the note opens at the link.
3. **Outgoing Links** for `Links.md` lists its targets and `Missing note`
   under not created yet.
4. Edit a note to add a link without saving: both views update; closing
   without saving reverts them. Turning the switches off hides the views.

### settings commands

1. **Open Settings**: Run Open Settings from the palette with no editor open: the Settings UI shows with the search `@ext:t04dj14n9.vscode-markdown-workshop`.
2. **Set Note Font Size**: Run it: the box shows the current `markdownWorkshop.editor.fontSize`; type 20 and Enter, the open note's text, headings and line numbers grow at once and the Settings UI shows 20; 7 or `abc` is refused; Escape changes nothing.
3. **Toggle Line Numbers**: Run it twice: the gutter hides and shows, and `markdownWorkshop.plugins.lineNumbers.enabled` in the Settings UI follows each run.
4. **Toggle Readable Line Width**: Run it twice: the note's width limit switches, and `markdownWorkshop.editor.readableLineLength` follows.
5. **Toggle Mermaid Diagrams**: With a mermaid block open, run it twice: the diagram turns to source and back, and `markdownWorkshop.plugins.diagrams.enabled` follows.
6. **Toggle Inline Title**: Run it twice: the title above the note shows and hides, and `markdownWorkshop.plugins.inlineTitle.enabled` follows.
7. **Toggle Vim Mode**: Run it twice: Vim mode and its caret turn on and off, and `markdownWorkshop.plugins.vim.enabled` follows.
8. **Change Setting…**: run it and pick any setting; booleans flip, enums open a list, numbers and strings an input box (numbers are checked against the setting's range), lists open the Settings UI on that key.

### quickSwitcher

1. **Quick Switcher** with an empty query lists recent notes. `Dest`
   finds `Target` by its alias; Enter opens it.
2. A new name creates the note (in the new-note folder).

### wordCount

1. The status bar shows words and characters; with a selection, those of
   the selection. CJK characters count one word each.

### linkUpdates

1. Rename `Target.md` to `Goal.md` in the Explorer: a dialog asks to update
   links in the notes that link to it. Accept: links (with aliases,
   headings and blocks) now point at `Goal`. Decline: nothing changes.
2. `markdownWorkshop.linkUpdates.mode`: `always` skips the dialog,
   `never` changes nothing.

### gitGutter

On by default. Needs the built-in Git extension and a note in a repository.

1. Commit `Core.md`, then edit a paragraph, add a line and delete a line: green
   (added), blue (modified) bars and a red triangle (deleted) appear between the
   line numbers and the fold markers within a moment, in the theme's
   `editorGutter.*Background` colours, in a light and a dark theme.
2. Change a table cell or a code block line: the rendered block gets one bar for
   the whole block.
3. Click a bar: a peek opens below the change with the HEAD and working-tree
   versions rendered side by side, changed words tinted. ↑/↓ move between
   changes, **Revert** restores the old text as one undo step, **Stage File**
   stages the file, Escape or ✕ closes it.
4. **Go to Next/Previous Git Change** (Alt+F5 / Shift+Alt+F5) wrap around; **Show
   Git Change** (Alt+F3) opens the peek.
5. Commit: the bars clear. Set `markdownWorkshop.gitGutter.compareTo` to
   `index`: bars compare with the staged text. Turn the plugin off: bars and
   peek disappear and nothing else changes.

### gitInline

Off by default; needs **gitGutter**. Turn it on with **Toggle Inline Git Changes**.

1. In the committed `Core.md` with edits (see gitGutter), run **Toggle Inline
   Git Changes**: removed words appear struck through in the
   `diffEditor.removedTextBackground` tint, added words in
   `diffEditor.insertedTextBackground`, added lines tinted, in a light and a
   dark theme. The caret skips the removed words; copying a passage does not
   include them.
2. A changed table, code block or frontmatter shows its HEAD version above it,
   rendered and dimmed, labelled "Before · line N in HEAD"; a removed paragraph
   shows struck through with "Removed". **Restore** puts the old text back as
   one undo step.
3. Turn gitGutter off: inline changes disappear and the plugin waits ("Waiting
   for Git change bars"); on again, they return. Run the toggle again: every
   decoration goes and the note is unchanged.

### folding

`Core.md`.

1. Use the gutter, **Fold All**, **Unfold All** and **Toggle Fold**.
   Heading folds stop at the next heading of the same level; list folds
   include children. Reload: folds are restored.
2. `markdownWorkshop.folding.heading` and `markdownWorkshop.folding.indent`
   act independently.

### lineNumbers

On by default.

1. Open `Formatting.md` in Workshop and, beside it, with **Open With >
   Text Editor**, in a light and a dark theme: the numbers use the same font
   family, the note's own size (`markdownWorkshop.editor.fontSize`), colours (brighter on the caret line), right alignment and gutter
   width, with fold chevrons between numbers and text on hover. Each number
   sits level with its line, including headings.
2. A rendered block (table, callout, math, diagram) lists the numbers of all
   the source lines it covers; no number is skipped. Inserting and deleting
   lines renumbers.
3. Set `editor.lineNumbers` (or `[markdown]` `editor.lineNumbers`) to `off`,
   `relative` and `interval`: the gutter follows without reopening.

### indentGuides

1. Nested lists in `Core.md` show one guide per ancestor list, aligned beneath
   its marker. In a scratch copy, add an ordered parent with three-space child
   indentation, tab-indented lists and task children: they use the same visual
   nesting steps. Long items keep
   guides through soft wraps without a second set at source tab stops. Separate
   source continuation lines have no guides; indented code and non-list text
   retain source-column guides.
2. Toggle `markdownWorkshop.plugins.indentGuides.enabled` off: every guide
   disappears while bullets and indentation stay in place. Turn it on and
   switch to Source mode: guides follow source tab stops. Switch back: list
   guides follow visual nesting again, with no text edits.

### spellcheck

1. Misspelled words are underlined (the dictionary is the OS's); off
   removes underlines.

### autoPair

1. Brackets, quotes and Markdown markers (`**`, `==`, `` ` ``) pair and wrap
   selections; Backspace removes an empty pair.
   `markdownWorkshop.autoPair.brackets` and
   `markdownWorkshop.autoPair.markdown` switch the two families.

### smartLists

1. Enter continues a list item (bullets, numbers, tasks); Enter on an empty
   item ends the list; Backspace at an item start removes the marker.

### formatting

`Core.md` (Formatting section).

1. Run **Toggle Bold**, **Toggle Italics**, **Toggle Strikethrough**,
   **Toggle Highlight**, **Toggle Inline Code** and **Toggle Comment** on a
   selection and at a caret, twice each. **Insert Link**, **Insert
   Horizontal Rule**, **Set Heading 0**–**6**, **Toggle Bullet List**,
   **Toggle Numbered List**, **Toggle Blockquote**, **Swap Line Up** and
   **Swap Line Down** act on all selected lines.
2. Mod+B, Mod+I and Mod+K are bound; the others are unbound until checked
   against Obsidian's hotkeys.
3. With a note as the active editor, focus the Explorer and press Mod+B:
   the sidebar toggles and the note is unchanged. From the Explorer, Mod+K
   Mod+S opens Keyboard Shortcuts; in Cursor, Mod+I and Mod+K from the chat
   input do what Cursor binds them to. Click back into the note: Mod+B, Mod+I
   and Mod+K format again, also inside a table cell. Repeat with the note
   open in two panels, focusing each in turn.

### vim

Off by default.

1. Normal, insert and visual modes; `:w`, `:q`, `:wq`, `:x`, `:u`, `:red`
   use VS Code's save, close and undo. IME in normal mode inserts nothing.
2. With Vim on, Control+O, B, I, K, Shift+X, Shift+T, Shift+H and Alt+0–6 reach
   Vim instead of VS Code; with Vim off they do not. With focus outside the
   note (Explorer, terminal, chat) they reach VS Code even with Vim on.
3. In a plain paragraph in `Formatting.md`, compare with the built-in editor
   using a Vim extension. Escape and `v` show a full block over one character,
   with the glyph readable in `editorCursor.background` on
   `editorCursor.foreground`. `i` shows a line; `R` and pending `r` show a
   two-pixel underline. Type a replacement or cancel with Escape: the block
   returns. Repeat with `3r`, visual-line/block selections, emoji, combining
   characters, a blank line, line end, headings and an active table cell.
4. Set native `editor.cursorWidth` to 3, then 5: insert-mode line width follows.
   Cycle `editor.cursorBlinking` through blink, smooth, phase, expand and solid:
   verify hard blinking, fading, soft blinking, vertical expansion and no blink.
   Set `editor.cursorSmoothCaretAnimation` to off, explicit and on: movement is
   immediate, animated for navigation, then animated for typing too. Verify in
   light and dark themes, after scrolling, when focus leaves, and in two panels.
5. With Vim off, cycle native `editor.cursorStyle` through line, block,
   underline, line-thin, block-outline and underline-thin. Line follows the
   native width, thin styles stay 1 px, underline is 2 px and blocks are one
   character wide. Check `[markdown]` overrides, live settings changes, selection
   backgrounds, and turning Vim off/on without changing the note or selection.

6. On macOS, use English and Chinese input sources in a disposable note. In normal
   mode, Shift+4 moves to the last character of the logical line, Shift+6 to its
   first nonblank character, and `0` to its start. Repeat in a narrow, wrapped CJK
   paragraph and in a table cell; cell motions stay inside that cell. Add leading
   spaces while editing the cell to distinguish `^` from `0`. Chinese `￥`/`¥`,
   `……`/`…`, or `Process` key events on Shift+4/6 must produce the same motions.
   In insert mode, punctuation remains literal; `f￥` and `r￥` retain their literal
   argument. Search/Ex prompts and an already active composition remain input.
   Repeat after disabling/re-enabling Vim and with the same note in two panels.

### pasteHtml

1. Copy a web page section with headings, emphasis, nested task lists,
   links, images and a table; paste: Markdown arrives as one undo step.
   Shift+Mod+V pastes plain text. Inside a table cell only that cell
   changes. No pasted script runs.

### copyLinkForAgent

1. Select lines and run **Copy Link for Agent** (palette, editor
   context menu, selection menu): the clipboard holds `@path#start-end`
   (`#N` for one line), a blank line and the passage quoted with `> ` (or
   the only agent chat receives it), with a notice saying where it went.
2. With unsaved changes, a prompt offers Save and Copy, Copy Text Only and
   Cancel; each does only that.
3. There is no Copy for Agent or Ask Agent about Selection command, title
   button, context menu item or Mod+Alt+C binding (removed or renamed by
   owner decision; Ctrl+C copies plain text).
4. On macOS, in VS Code and in Cursor, with only a caret in a paragraph,
   two-finger click (then Ctrl-click) a word: the word is selected and the
   first menu already lists Copy Link for Agent, which copies that word's
   line. Two-finger click inside an existing multi-line selection, on plain
   text and on a rendered link in it: the selection stays and the menu
   lists the item. On Windows or Linux, right-click with only a caret: the
   menu has no Copy Link for Agent.

### cursorBridge

In **Cursor** only: select text in Live Preview, press Cmd/Ctrl+L (Chat) and
Cmd/Ctrl+K (Edit). Edit should open Cursor’s native bar; Accept updates the note
in Markdown Workshop without a custom apply-back. With no selection, both
commands no-op with a short notice. Disable `markdownWorkshop.plugins.cursorBridge.enabled`
and confirm Cmd/Ctrl+K is Insert Link again. On plain VS Code, Insert Link keeps
Cmd/Ctrl+K. Leave `agentBridge` behaviour unchanged.


### openCopiedAgentReference

1. Copy `@Core.md#2-3` and run **Open Copied Agent Reference**, with no note
   open. Confirm the prefilled reference: Markdown Workshop opens and
   selects those complete source lines. Repeat with a quoted reference and
   a one-line `#2` reference. A copied agent payload prefills only its first
   line; unrelated clipboard content leaves the prompt empty.
2. Repeat with CRLF, unsaved pending edits, and a note already open in two
   panels. The selected source range is computed after the target panel is
   ready and its edits are flushed. Out-of-range or malformed references
   show an error instead of selecting a different range.
3. Add a second disposable workspace folder containing `Core.md`. A
   relative reference asks which folder to use; cancel opens nothing.
   Full file/remote URIs select the explicit note without guessing a root.
   A missing file, `../` escape or escaping symlink is refused; no note is
   created. Canceling the reference prompt also opens nothing.
4. Native chat-link clicks remain host-controlled. Use this command when a
   click opens a note without revealing its line range; do not count it as
   transparent chat-click support or global Back/Forward history.

### sources and nested Properties

A note inside an OKF bundle, with a `sources` frontmatter list and a `generated`
map. Confirm light and dark themes.

1. Rows stack in document order. The first eight are expanded. **Showing 8 of
   N** reveals the rest. Revealing rows does not change the file. Beneath the
   rows, a YAML draft edits the whole `sources` value; committing it updates
   frontmatter (undoable like other Properties).
2. A row shows its title, or a resource-derived label, with the original
   resource on its own line. `id` appears only when the entry has one, as plain
   selectable text (no Copy id button). A missing `usage_count` is not shown as
   zero; zero is shown as zero. An entry `usage_window` wins over the inherited
   one.
3. An `https` resource opens in the browser. A bundle path opens that workspace
   file. `command:`, `javascript:` and `data:` stay plain text and do not open.
   Nothing is fetched to preview a title or a remote page.
4. Edit the note so the clicked resource is gone, then activate the stale row.
   The click does nothing. It does not open a different source by position.
5. A note outside a bundle still shows the rows. A path that leaves the vault
   does not open.
6. `generated` (and any other nested map / list-of-maps) is editable as YAML in
   Properties and writes back into the note. Scalar and scalar-list properties
   keep their usual controls.
7. Add a comment between `generated.by` and `generated.checksum`, and quote the
   checksum. Open the YAML draft: its comments and quoting match the source.
   Change only `by`, add another comment in the draft, and commit with
   Ctrl/Cmd+Enter or Save. Both comments and the checksum's quoting survive.
   Repeat with comments inside Sources entries and with a CRLF note. Undo once
   restores the whole edit.
8. In source, add `first: &a 9007199254740993` and `mirror: *a`. Edit `first`
   through Properties. Inspect source: `mirror` becomes the exact decimal
   `9007199254740993`. Repeat with that number inside an anchored collection.
9. Add `pairs: !!pairs [a: 1, b: 2]` and an empty `!!pairs []`, plus nested
   `!!pairs`, `!!set`, `!!map` and `!!timestamp` values. These rows remain
   display-only. Editing another property leaves every tag unchanged.
10. Start a YAML draft, then edit its property or a frontmatter comment from
    another view before committing. The draft reports a conflict and preserves
    the other edit. A body-only edit still permits the property commit.

### vault graph

**Open Vault Graph** (`markdownWorkshop.graph.open`). One panel per window; running
the command again reveals it. The panel is not tied to a Markdown document.

1. With the active note inside one OKF bundle, the toolbar shows that bundle's
   name and path. Notes are directed: a link from A to B is not the same edge
   as B to A. `index.md` and `log.md` are not nodes. A note with no `type` is
   still drawn. Clicking a node opens that note.
2. Open a note that sits in no bundle, or in a workspace with several bundles,
   and the command asks which bundle to use. Cancel leaves the previous scope.
   It does not pick the first workspace folder. Switching notes does not move
   the graph to the new note. **Choose Vault Graph Bundle**
   (`markdownWorkshop.graph.chooseBundle`) asks again.
3. Local mode draws the neighbourhood of the note that was active at open, or
   of the last node you clicked. Depth is 1–3. If filters hide that note, the
   panel says **Focus excluded by filters**. **Clear filters** brings it back
   and does not jump to a different note.
4. Orphans, type, tag, folder and text search narrow the drawing. A vault over
   the node or edge cap shows the counts and draws nothing until the filters
   fit. There is no sampled substitute. **Re-layout** runs after a large change;
   filtering does not throw the remaining notes to new coordinates.
5. Hide the panel and show it again. The layout worker does not keep running
   while it is hidden. Close the panel. The worker stops. Repeat in light and
   dark themes. The graph does not request remote images or URLs.
6. Settings, all off in a minimal preset: `markdownWorkshop.plugins.graph.enabled`,
   `markdownWorkshop.plugins.okfCore.enabled`,
   `markdownWorkshop.plugins.sourcesProperty.enabled`,
   `markdownWorkshop.graph.maxNodes`, `markdownWorkshop.graph.maxEdges`,
   `markdownWorkshop.graph.defaultMode`, `markdownWorkshop.graph.localDepth`,
   `markdownWorkshop.graph.colorBy`, `markdownWorkshop.okfCore.bundles`.

## External plugins

The sample plugin in `test/fixtures/sample-plugin/` is the example from
`API.md`. Its README says how to build it (`pnpm sample`), package it and
install it into the same isolated profile, and lists what it does.

1. In a note with `TODO` in it, each `TODO` gets a badge; clicking one
   shows which line it is on. Markers follow edits; deleting a line removes its
   marker. Two panels have independent marker sets.
2. Add `[#42](ticket:42)` to a note and click it: the issue page opens in
   the browser (`mwsampleTickets.baseUrl`). No "open external
   application?" prompt appears, because the plugin claims `ticket:`.
3. A ```` ```tickets ```` fence lists ticket links, rendered and sanitized.
   In an untrusted workspace it stays an ordinary code block.
4. **Sample Tickets: Refresh TODO Badges** recomputes the badges.
5. Turn it off in `markdownWorkshop.plugins.external` or uninstall it:
   markers, link handling, the fence renderer and the command go away
   without touching built-in plugins. **Show Plugin Status** lists it as
   external.

### gitDiffEditor

On by default; VS Code's text diff stays the default until
`markdownWorkshop.gitDiffEditor.diffEditor` is `rendered`.

1. With `Core.md` edited since the last commit, run **Open Rendered Git Diff**:
   a panel shows HEAD on the left (read-only badge) and the working tree on the
   right, both rendered, blocks side by side, changed words tinted with
   `diffEditor.removedTextBackground` / `insertedTextBackground`, added and
   removed blocks against a hatched spacer, in a light and a dark theme.
   Frontmatter, code and math show as lines with changed lines tinted.
2. Edit the note: the right side follows. **↑/↓** and Alt+F5 move between
   changes; **Open File** opens the note; **Text Diff** opens VS Code's diff.
3. Set `diffEditor` to `rendered` and open the note from Source Control
   (working tree and staged changes): the text diff tab is replaced by the
   rendered panel. Non-Markdown files keep the text diff.
4. Disable the plugin: open panels close and Source Control opens the text
   diff again.

5. Compare a note containing `# Intro`, a blank line, then
   `---\nstatus: retained\n---`, another blank line and `Tail.`. The body
   rule and setext heading stay visible when unchanged and when `retained`
   changes on one side. Actual leading frontmatter still shows as source lines.
6. Put `[g]: /target` before an unclosed fenced code block containing
   `keep exactly this`. An unchanged comparison shows only that original code;
   no reference definition appears inside the fence.
7. Compare `![diagram](assets/old.png)` with `![diagram](assets/new.png)` using
   different contained fixture images. Both load from their respective sides.
   Change the same image path between HEAD, index and working tree: each side
   shows its own bytes. Missing or escaped paths show explicit source fallbacks.
8. After Source Control takeover, close remaining native note editors. Stage
   new contents externally, then edit the working file externally. The open
   rendered panel follows both changes. Close the panel and repeat: no disposed
   panel updates or retained subscriptions should remain.

### wiki, assets, scratch and Marp

Use a disposable folder, never a personal vault. Add the slim
`.wiki/layout.json` from `docs/bridge-envelope.md` if you want collection
paths; a missing layout is the legacy preset.

1. **Copy Bridge Envelope** on a saved selection: the clipboard is JSON with
   `version: 1`, a durable `@path#lines` locator, a different `view.id`,
   `capturedAt`, and distinct `selection.sha256` and `revision.sourceSha256`.
   No chat opens. Repeat while the note is dirty: the durable path remains,
   `revision.isDirty` is true, and `revision.sourceSha256` is absent.
2. **Copy Wiki Reference for Agent** copies `@path#lines` and the quoted
   passage and says that no agent was started. With the Bridge plugin off,
   it tells you to turn Bridge on.
3. Put `[[Other]]` in a page under the bundle: the Problems panel reports a
   portable Markdown link. The same text in a fence, in frontmatter, or
   outside the bundle does not. A bundle page with no `type` is reported.
   `knowledge/index.md` and `knowledge/log.md` are not.
4. **Import Asset** of a new png creates the assets folder and inserts
   `![…](…)` relative to the note. Import the same name again and choose
   Keep both: the file is `name-2` and the folder is not recreated. Point
   assets at a folder inside the bundle: the import is refused.
5. **New Scratch Note** writes under `scratch/` (or the layout's scratch
   path) with `title` and `captured` and no `type`. **Promote Scratch Note**
   to Concept writes `## Definition` and the other fixed sections, replaces
   the scratch note with a Markdown link, and does not change `index.md`.
   A scratch note with `marp: true` is refused and left in place.
6. A note with `marp: true` offers **Open Marp Preview to the Side**.
   **Export Marp Slide Deck** in an untrusted workspace is refused. With
   Marp for VS Code installed and the workspace trusted, the text editor
   opens and Marp's export follows. **Toggle Marp** flips only the `marp`
   flag. Set `markdownWorkshop.marp.open` to `textEditor`: the deck opens
   in the text editor; **Keep Marp Deck in Workshop** brings it back.
   A deck saved inside the bundle without `type` and `generated` is
   reported and is not rewritten. **Move Marp Deck Outside Bundle** moves
   it under `exports/` and copies a Markdown link; the deck text is unchanged.

<!-- command-setting-inventory:start -->
## Complete command and setting acceptance inventory

Use the disposable fixture vault from Setup. These rows enumerate every generated command and setting. No Obsidian observation is implied. All verify shortcuts remain unbound.

| Command | Default keys | Procedure and expected outcome |
| --- | --- | --- |
| `markdownWorkshop.copyLinkForAgent` — Copy Link for Agent | unbound | On a disposable fixture, run Copy Link for Agent; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.cursorBridge.chat` — Cursor Chat with Selection | ctrl+l (Mac cmd+l) | In Cursor with a selection, opens Chat with the selection as context. |
| `markdownWorkshop.cursorBridge.edit` — Cursor Edit Selection | ctrl+k (Mac cmd+k) | In Cursor with a selection and cursorBridge enabled, opens native Edit. |
| `markdownWorkshop.assets.import` — Import Asset | unbound | On a disposable fixture, run Import Asset; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.ideContext.copy` — Copy IDE Context | unbound | On a disposable fixture, run Copy IDE Context; confirm clipboard markdown includes active/tabs/diagnostics and no agent opens. Repeat after disable/re-enable. |
| `markdownWorkshop.ideContext.send` — Send IDE Context to Agent… | unbound | On a disposable fixture, run Send IDE Context to Agent…; confirm clipboard always updates and agent open follows forced/sole-agent/picker rules (never silent-guess). |
| `markdownWorkshop.bridge.copyEnvelope` — Copy Bridge Envelope | unbound | On a disposable fixture, run Copy Bridge Envelope; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.bridge.envelope` — Bridge Envelope | unbound | On a disposable fixture, run Bridge Envelope; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.insertCallout` — Insert Callout | unbound | On a disposable fixture, run Insert Callout; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.save` — Save | unbound | On a disposable fixture, run Save; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.undo` — Undo | unbound | On a disposable fixture, run Undo; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.redo` — Redo | unbound | On a disposable fixture, run Redo; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.close` — Close | unbound | On a disposable fixture, run Close; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.saveClose` — Save and Close | unbound | On a disposable fixture, run Save and Close; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.openAsText` — Open as Text | unbound | On a disposable fixture, run Open as Text; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.jumpBack` — Go Back in Note | unbound | On a disposable fixture, run Go Back in Note; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.jumpForward` — Go Forward in Note | unbound | On a disposable fixture, run Go Forward in Note; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.titleActions` — Note Actions | unbound | On a disposable fixture, run Note Actions; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.selectionActions` — Selection Actions | unbound | On a disposable fixture, run Selection Actions; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.useForMarkdownInWorkspace` — Use Markdown Workshop for Markdown in This Workspace | unbound | On a disposable fixture, run Use Markdown Workshop for Markdown in This Workspace; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.insertEmbed` — Insert Embed | unbound | On a disposable fixture, run Insert Embed; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.foldAll` — Fold All | unbound | On a disposable fixture, run Fold All; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.unfoldAll` — Unfold All | unbound | On a disposable fixture, run Unfold All; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleFold` — Toggle Fold | unbound | On a disposable fixture, run Toggle Fold; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.insertFootnote` — Insert Footnote | unbound | On a disposable fixture, run Insert Footnote; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleBold` — Toggle Bold | ctrl+b (Mac cmd+b) | On a disposable fixture, run Toggle Bold; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleItalics` — Toggle Italics | ctrl+i (Mac cmd+i) | On a disposable fixture, run Toggle Italics; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleStrikethrough` — Toggle Strikethrough | unbound | On a disposable fixture, run Toggle Strikethrough; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleHighlight` — Toggle Highlight | unbound | On a disposable fixture, run Toggle Highlight; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleCode` — Toggle Inline Code | unbound | On a disposable fixture, run Toggle Inline Code; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleComment` — Toggle Comment | unbound | On a disposable fixture, run Toggle Comment; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.insertLink` — Insert Link | ctrl+k (Mac cmd+k) | On a disposable fixture, run Insert Link; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.insertHorizontalRule` — Insert Horizontal Rule | unbound | On a disposable fixture, run Insert Horizontal Rule; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleBulletList` — Toggle Bullet List | unbound | On a disposable fixture, run Toggle Bullet List; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleNumberedList` — Toggle Numbered List | unbound | On a disposable fixture, run Toggle Numbered List; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleBlockquote` — Toggle Blockquote | unbound | On a disposable fixture, run Toggle Blockquote; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.swapLineUp` — Swap Line Up | unbound | On a disposable fixture, run Swap Line Up; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.swapLineDown` — Swap Line Down | unbound | On a disposable fixture, run Swap Line Down; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.setHeading0` — Set Heading 0 | unbound | On a disposable fixture, run Set Heading 0; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.setHeading1` — Set Heading 1 | unbound | On a disposable fixture, run Set Heading 1; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.setHeading2` — Set Heading 2 | unbound | On a disposable fixture, run Set Heading 2; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.setHeading3` — Set Heading 3 | unbound | On a disposable fixture, run Set Heading 3; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.setHeading4` — Set Heading 4 | unbound | On a disposable fixture, run Set Heading 4; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.setHeading5` — Set Heading 5 | unbound | On a disposable fixture, run Set Heading 5; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.setHeading6` — Set Heading 6 | unbound | On a disposable fixture, run Set Heading 6; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.gitDiffEditor.open` — Open Rendered Git Diff | unbound | On a disposable fixture, run Open Rendered Git Diff; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.gitGutter.nextChange` — Go to Next Git Change | alt+f5 | On a disposable fixture, run Go to Next Git Change; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.gitGutter.previousChange` — Go to Previous Git Change | shift+alt+f5 | On a disposable fixture, run Go to Previous Git Change; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.gitGutter.showChange` — Show Git Change | alt+f3 | On a disposable fixture, run Show Git Change; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.graph.open` — Open Vault Graph | unbound | On a disposable fixture, run Open Vault Graph; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.graph.chooseBundle` — Choose Vault Graph Bundle | unbound | On a disposable fixture, run Choose Vault Graph Bundle; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.insertWikilink` — Insert Wikilink | unbound | On a disposable fixture, run Insert Wikilink; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.followLink` — Follow Link | unbound | On a disposable fixture, run Follow Link; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.openLinkToSide` — Open Link to Side | unbound | On a disposable fixture, run Open Link to Side; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleSourceMode` — Toggle Live Preview/Source Mode | unbound | On a disposable fixture, run Toggle Live Preview/Source Mode; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.marp.preview` — Open Marp Preview to the Side | unbound | On a disposable fixture, run Open Marp Preview to the Side; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.marp.export` — Export Marp Slide Deck | unbound | On a disposable fixture, run Export Marp Slide Deck; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.marp.toggle` — Toggle Marp | unbound | On a disposable fixture, run Toggle Marp; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.marp.moveOutside` — Move Marp Deck Outside Bundle | unbound | On a disposable fixture, run Move Marp Deck Outside Bundle; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.marp.keepInWorkshop` — Keep Marp Deck in Workshop | unbound | On a disposable fixture, run Keep Marp Deck in Workshop; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleInlineMath` — Toggle Inline Math | unbound | On a disposable fixture, run Toggle Inline Math; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.insertMathBlock` — Insert Math Block | unbound | On a disposable fixture, run Insert Math Block; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.outline.expandAll` — Expand All | unbound | On a disposable fixture, run Expand All; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.outline.enableFollowCursor` — Follow Cursor | unbound | On a disposable fixture, run Follow Cursor; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.outline.disableFollowCursor` — ✓ Follow Cursor | unbound | On a disposable fixture, run ✓ Follow Cursor; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.outline.toggle` — Toggle Markdown Outline | Ctrl+Alt+O; macOS Ctrl+Cmd+O | Hide and restore Markdown Outline in the primary sidebar, secondary sidebar and panel; keep unrelated views visible. |
| `markdownWorkshop.outline.goToHeading` — Go to Heading… | Ctrl+Shift+O; macOS Cmd+Shift+O | Search parsed headings and accept or dismiss the picker in Workshop; switch to a plain text split and confirm its native symbol shortcut remains available. |
| `markdownWorkshop.addProperty` — Add File Property | ctrl+; (Mac cmd+;) | On a disposable fixture, run Add File Property; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.managePlugins` — Manage Plugins | unbound | On a disposable fixture, run Manage Plugins; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.openCopiedAgentReference` — Open Copied Agent Reference | unbound | On a disposable fixture, run Open Copied Agent Reference; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.showPluginStatus` — Show Plugin Status | unbound | On a disposable fixture, run Show Plugin Status; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.quickSwitcher` — Quick Switcher | unbound | On a disposable fixture, run Quick Switcher; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.scratch.new` — New Scratch Note | unbound | On a disposable fixture, run New Scratch Note; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.scratch.promote` — Promote Scratch Note | unbound | On a disposable fixture, run Promote Scratch Note; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.openSettings` — Open Settings | unbound | On a disposable fixture, run Open Settings; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.changeSetting` — Change Setting… | unbound | On a disposable fixture, run Change Setting…; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.setNoteFontSize` — Set Note Font Size | unbound | On a disposable fixture, run Set Note Font Size; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleLineNumbers` — Toggle Line Numbers | unbound | On a disposable fixture, run Toggle Line Numbers; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleReadableLineWidth` — Toggle Readable Line Width | unbound | On a disposable fixture, run Toggle Readable Line Width; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleMermaid` — Toggle Mermaid Diagrams | unbound | On a disposable fixture, run Toggle Mermaid Diagrams; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleInlineTitle` — Toggle Inline Title | unbound | On a disposable fixture, run Toggle Inline Title; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleInlineGitChanges` — Toggle Inline Git Changes | unbound | On a disposable fixture, run Toggle Inline Git Changes; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleVim` — Toggle Vim Mode | unbound | On a disposable fixture, run Toggle Vim Mode; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.insertTable` — Insert Table | unbound | On a disposable fixture, run Insert Table; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.tableInsertRowAbove` — Table: Insert Row Above | unbound | On a disposable fixture, run Table: Insert Row Above; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.tableInsertRowBelow` — Table: Insert Row Below | unbound | On a disposable fixture, run Table: Insert Row Below; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.tableInsertColumnLeft` — Table: Insert Column Left | unbound | On a disposable fixture, run Table: Insert Column Left; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.tableInsertColumnRight` — Table: Insert Column Right | unbound | On a disposable fixture, run Table: Insert Column Right; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.tableDeleteRow` — Table: Delete Row | unbound | On a disposable fixture, run Table: Delete Row; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.tableDeleteColumn` — Table: Delete Column | unbound | On a disposable fixture, run Table: Delete Column; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.tableMoveRowUp` — Table: Move Row Up | unbound | On a disposable fixture, run Table: Move Row Up; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.tableMoveRowDown` — Table: Move Row Down | unbound | On a disposable fixture, run Table: Move Row Down; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.tableMoveColumnLeft` — Table: Move Column Left | unbound | On a disposable fixture, run Table: Move Column Left; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.tableMoveColumnRight` — Table: Move Column Right | unbound | On a disposable fixture, run Table: Move Column Right; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.tableAlignLeft` — Table: Align Left | unbound | On a disposable fixture, run Table: Align Left; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.tableAlignCenter` — Table: Align Center | unbound | On a disposable fixture, run Table: Align Center; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.tableAlignRight` — Table: Align Right | unbound | On a disposable fixture, run Table: Align Right; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.tableSortAscending` — Table: Sort Ascending | unbound | On a disposable fixture, run Table: Sort Ascending; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.tableSortDescending` — Table: Sort Descending | unbound | On a disposable fixture, run Table: Sort Descending; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.toggleChecklist` — Toggle Checklist Status | unbound | On a disposable fixture, run Toggle Checklist Status; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.cycleListChecklist` — Cycle List Checklist | unbound | On a disposable fixture, run Cycle List Checklist; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.consumeVimHostShortcut` — Consume Vim Host Shortcut | ctrl+o (Mac ctrl+o); ctrl+b (Mac ctrl+b); ctrl+i (Mac ctrl+i); ctrl+shift+x (Mac ctrl+shift+x); ctrl+k (Mac ctrl+k); ctrl+alt+0 (Mac ctrl+alt+0); ctrl+alt+1 (Mac ctrl+alt+1); ctrl+alt+2 (Mac ctrl+alt+2); ctrl+alt+3 (Mac ctrl+alt+3); ctrl+alt+4 (Mac ctrl+alt+4); ctrl+alt+5 (Mac ctrl+alt+5); ctrl+alt+6 (Mac ctrl+alt+6); ctrl+shift+t (Mac ctrl+shift+t); ctrl+shift+h (Mac ctrl+shift+h) | Enable Vim and press the listed keys; host commands must not steal them. This helper stays hidden from the palette. |
| `markdownWorkshop.wiki.copyForAgent` — Copy Wiki Reference for Agent | unbound | On a disposable fixture, run Copy Wiki Reference for Agent; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.wiki.copyEnvelope` — Copy Wiki Bridge Envelope | unbound | On a disposable fixture, run Copy Wiki Bridge Envelope; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.wiki.showLayout` — Show Wiki Layout | unbound | On a disposable fixture, run Show Wiki Layout; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkshop.wiki.refresh` — Refresh Wiki Diagnostics | unbound | On a disposable fixture, run Refresh Wiki Diagnostics; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |

| Setting | Default | Procedure |
| --- | --- | --- |
| `markdownWorkshop.plugins.agentBridge.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.cursorBridge.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.assets.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.autoPair.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.backlinks.enabled` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.ideContext.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.bridge.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.callouts.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.codeBlocks.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.diagrams.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.embeds.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.folding.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.footnotes.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.formatting.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.gitDiffEditor.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.gitGutter.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.gitInline.enabled` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.graph.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.indentGuides.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.inlineTitle.enabled` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.lineNumbers.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.linkUpdates.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.links.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.marp.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.math.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.obsidianCompat.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.okfCore.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.onlineVideos.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.outgoingLinks.enabled` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.outline.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.pagePreview.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.pasteHtml.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.properties.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.quickSwitcher.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.scratch.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.search.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.smartLists.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.sourcesProperty.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.spellcheck.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.suggest.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.tables.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.tags.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.tasks.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.vim.enabled` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.wiki.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.wordCount.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.assets.path` | `""` | string; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.autoPair.brackets` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.autoPair.markdown` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.editor.defaultMode` | `"livePreview"` | livePreview / source; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.editor.readableLineLength` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.editor.reclaimTextEditor` | `"auto"` | auto / on / off; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.editor.warmTextDocument` | `"auto"` | auto / on / off; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.editor.strictLineBreaks` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.editor.rightToLeft` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.editor.useTabs` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.editor.tabSize` | `4` | integer; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.editor.dragScrollSpeed` | `4` | number 1–10; text-selection auto-scroll multiplier (1 = original CodeMirror speed); Editor scenario 8, then reset the override. |
| `markdownWorkshop.editor.fontSize` | `16` | number; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.editor.lineHeight` | `1.5` | number; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.folding.heading` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.folding.indent` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.gitDiffEditor.diffEditor` | `"native"` | native / rendered; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.gitGutter.compareTo` | `"HEAD"` | HEAD / index; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.graph.maxNodes` | `2000` | number; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.graph.maxEdges` | `20000` | number; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.graph.defaultMode` | `"global"` | global / local; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.graph.localDepth` | `2` | number; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.graph.colorBy` | `"type"` | type / folder / tag; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.linkUpdates.mode` | `"prompt"` | prompt / always / never; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.links.newLinkFormat` | `"shortest"` | shortest / relative / absolute; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.links.useWikilinks` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.links.folderNote` | `""` | string; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.files.newNoteFolder` | `""` | string; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.files.attachmentFolder` | `""` | string; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.marp.open` | `"workbench"` | workbench / textEditor; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.obsidianCompat.configFolder` | `".obsidian"` | string; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.okfCore.bundles` | `[]` | array; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.onlineVideos.bilibiliPlayer` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.outline.followCursor` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.properties.display` | `"visible"` | visible / hidden / source; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.scratch.folder` | `"scratch"` | string; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.tags.viewSort` | `"name"` | name / frequency; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.tags.viewNested` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.vault.rootMarkers` | `[".obsidian"]` | array; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.vault.excludedFiles` | `[]` | array; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.copyLinkForAgent.target` | `"auto"` | auto / cursor / chat / claudeCode / codex / clipboard; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.debug.logging` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.plugins.external` | `{}` | object; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkshop.preset` | `"obsidian"` | obsidian / minimal; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |

Attachment folder is a validated destination policy; this release keeps pasted image links and does not import attachment files. `links.useWikilinks` changes suggestion acceptance; explicit Insert Wikilink retains wiki syntax. Strict line breaks affects rendered Markdown; source text and its line boundaries remain intact. Default mode affects newly opened panes, not restored pane state.
<!-- command-setting-inventory:end -->


## Local precise-jump navigation and restore races

`markdownWorkshop.jumpBack` (**Go Back in Note**) and
`markdownWorkshop.jumpForward` (**Go Forward in Note**) are unbound commands
and editor-title buttons. Exercise them in the scenarios below; native cross-file
history and Vim Control+O/Control+I remain separate.

- Jump between headings, block links, footnotes, explicit find matches and copied
  agent references. Back restores the departure selection and reading position;
  Forward restores the later view. Scroll before Back, then Forward, and confirm
  that departure scroll was refreshed. Typing and scrolling alone add no entries.
- Back, then a new link jump: the old forward branch disappears. Verify repeated
  identical jumps, 100-entry eviction, Unicode/CRLF notes and source edits before
  saved targets. Typing immediately after a jump must not lose that jump.
- Open the same note twice. Histories and positions remain independent. Recreate
  one webview without closing its pane: its stack remains. Closing/reopening the
  pane or restarting the extension host clears it. No cross-file stack is claimed.
- Delay initialization/layout; issue a newer reveal, switch panes or close the
  target. The old request must not move/focus a replacement webview. Check normal
  and side opens with both cold and warm same-note panes, including vertical splits.
- Navigate successfully, recreate the webview, and verify no stale URI target
  replays. Missing heading/block links show a message and preserve the caret.
- Restore a note with delayed image/font/math layout after a settled scroll.
  The source-line anchor stays at its viewport offset. Wheel, pointer and key
  interaction cancel pinning. Check folded tables/callouts and wrapped headings.
- Preserve standard Vim Ctrl+O/Ctrl+I and Cmd+I italics. Test text Undo separately:
  navigation history is not the native text history stack.

Native/browser suites were not expanded for these cases. These are pending
computer-use acceptance steps, not evidence of passed native behavior.

## Obsidian compatibility (phase 1)

Setup: copy `test/fixtures/vault` to two disposable workspace folders. Keep both
`.obsidian` files; add `.git` as another root marker in one folder. Never use the
owner's vault for these checks.

1. In one vault's `app.json`, set Markdown links, relative link format, attachment
   folder `/`, new-file location `current`, an `Archive/` ignore filter, hidden
   properties, `livePreview: false` and `alwaysUpdateLinks: true`. Open a fresh
   Workshop editor. It starts in Source mode; a fresh Live Preview view hides
   properties; link insertion uses Markdown/relative text, new notes use the
   originating folder, and archived notes leave switcher/search results but
   remain linkable. Rename a referenced note: links update without a prompt.
2. Set each corresponding Workshop setting explicitly in user, workspace,
   folder and applicable Markdown language settings. That explicit value wins,
   even when it equals the package default. Remove it to restore vault policy.
   Confirm VS Code settings files never change when `app.json` changes.
3. Give the second vault different app policies; open both and split one note
   into two panels. Each panel and command uses its originating vault. Switching
   focus during a new-note or rename action must not select another vault's
   policy. `alwaysUpdateLinks: false` restores MW's default prompt.
4. Externally edit and delete `app.json`; effective settings refresh or return to
   package defaults. Temporarily write invalid JSON: the last good policies stay
   in use and the output channel logs the read failure once. Fix the JSON to
   resume updates. `editor.defaultMode` applies when opening a new view.
5. Set `obsidianCompat.configFolder` to `.obsidian-awesome` and create that
   folder's files. Its policies replace `.obsidian` immediately; changes to the
   previous profile no longer apply. `.git` never becomes the config folder by
   marker order. A path outside the vault or an escaping symlink is rejected
   without blocking the Markdown editor or writing a file.
6. Turn Obsidian Compatibility off, then on; policies disappear and return, and
   closing/reloading the extension leaves no duplicate watchers. Inspect the
   fixture `types.json`: aliases remains `aliases`, tags remains `tags`, and
   cssclasses remains `multitext`. The properties UI still uses its existing
   preference storage. The compatibility registry is read-only because the host
   has no atomic conditional-write API: service edits reject, leaving existing
   bytes and unknown entries untouched and missing files/directories absent.
   External changes still refresh the scoped snapshots. Service rejection and
   concurrent-writer behavior are unit tested, with no new browser/native suite
   or UI type-storage migration.

## Current-line authorship (`gitBlame`)

In a disposable Git repository, commit a Markdown note with several paragraphs.
Change paragraph 2 in a second commit with a different author. Open the note in
Live Preview with `markdownWorkshop.plugins.gitBlame.enabled` on.

1. Put the main caret on an unchanged committed line. Expect quiet EOL text
   `Author, relative time • subject`, with “You” for matching Git identity. A
   root/boundary commit must still appear; long subjects end in an ellipsis.
2. Insert an unsaved line above paragraph 1, then put the caret on its shifted
   first line. Expect its original author/commit, rather than paragraph 2's
   author. On the newly inserted line, expect no ghost.
3. Edit without moving the caret, and move rapidly between lines. Expect the
   ghost to clear immediately and refresh after settling; old replies must not
   flash back. Same-line horizontal motion keeps the current ghost.
4. Open the same note in two panels. Move their carets independently, then
   commit/checkout in the disposable repository. Expect both to clear and
   refresh, with each showing its own caret line.
5. Toggle the setting off/on during rapid movement, and rename/reopen the note.
   Expect no old reply after disable or in another document. Re-enabling works
   immediately even after earlier repository changes.
6. Leave change bars and inline changes on: gutter clicks, peek, Revert and
   inline changes must still work. Turn the change bars off: authorship remains.
   Source mode hides authorship. Empty, untracked and non-repository notes show
   nothing. Check light, dark and high-contrast themes for readable muted text.
