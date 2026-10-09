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
   `vscode-markdown-workbench-<version>.vsix` in the repository root.
2. Copy the fixture vault: `cp -R test/fixtures/vault /tmp/mdwb-vault`.
3. Install into a throwaway profile and open the vault:

   ```sh
   code --user-data-dir /tmp/mdwb-manual/user \
        --extensions-dir /tmp/mdwb-manual/extensions \
        --install-extension vscode-markdown-workbench-0.1.0.vsix
   code --user-data-dir /tmp/mdwb-manual/user \
        --extensions-dir /tmp/mdwb-manual/extensions /tmp/mdwb-vault
   ```

   For Cursor use `cursor` with the same flags. Delete `/tmp/mdwb-manual`
   and `/tmp/mdwb-vault` afterwards.
4. Run **Markdown Workbench: Use Markdown Workbench for Markdown in This
   Workspace** once, so `.md` files open in the workbench (see Editor below).
5. Turn on `markdownWorkbench.debug.logging` while testing and keep the
   **Markdown Workbench** output channel open; note any error lines in the
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

- **Off and on.** Turn `markdownWorkbench.plugins.<id>.enabled` off with
  the note open: the plugin's rendering, commands, keys and views disappear;
  text, selection, undo history and other plugins' state stay. Turn it on:
  everything returns once, with no duplicates.
- **Two panels.** Open the note in two editor groups: selections, scroll,
  folds and disclosure states stay independent; edits appear in both.
- **Source mode.** Toggle Live Preview/Source: Source shows plain Markdown
  with no widgets.
- **Undo.** Every edit the plugin makes is one step in VS Code's undo.
- **Obsidian.** Where a step says "as in Obsidian", compare with Obsidian
  on a copy of the same vault and record the result in `docs/PARITY.md`.

The `minimal` preset (`markdownWorkbench.preset`) loads only the core
plugins; switching the preset takes effect for newly opened editors.

## Core plugins

### document

Owns the text, saving and history; VS Code's TextDocument is the authority.

1. In `Core.md`, type ASCII, CJK with an IME, emoji and several lines; save;
   undo and redo; run Save and Close, then reopen. Text and disk agree, IME
   characters are not duplicated, save includes pending edits, and undo/redo
   follow VS Code's history. Typing without pausing undoes as one step;
   moving the caret starts a new one.
2. Split `Core.md` into two workbench panels and open it as text in a third
   group (**Open as Text**). Edit in each; undo from another. All three show
   one document. Edit the file on disk while it is saved: the editors reload
   it without losing newer text.
3. Save a copy of `Core.md` with CRLF line endings (text editor status bar).
   Edit across lines in the workbench, save and undo: the file stays CRLF and
   selections do not drift.
4. Reload the window with unsaved changes: VS Code's hot exit restores them.

### editor

The CodeMirror view in a webview panel, its commands and view state.

1. Copy, cut and paste Markdown with the keyboard; paste into a text
   editor: the exact source is copied.
2. Give two panels different selections, scroll positions and modes; reload
   the window: each panel restores its own state.
3. Run **Use Markdown Workbench for Markdown in This Workspace**: the
   workspace `settings.json` gets `workbench.editorAssociations` entries for
   `*.md` and `*.markdown`, other associations stay, and running it again
   changes nothing. A note opened from the Explorer now opens in the
   workbench. **Open as Text** still opens the text editor.
4. Run **Note Actions** and **Selection Actions** from the palette (with and
   without a selection): a quick pick lists the registered actions.
5. Change `markdownWorkbench.editor.readableLineLength`,
   `markdownWorkbench.editor.rightToLeft`, `markdownWorkbench.editor.useTabs`
   and `markdownWorkbench.editor.tabSize` with the note open: the editor
   updates without reopening and keeps text, folds and selection.
   `markdownWorkbench.editor.defaultMode` applies to newly opened panels.
6. With `markdownWorkbench.debug.logging` on, the **Markdown Workbench**
   output channel shows debug lines from the host and the webview; with it
   off, only warnings and errors.

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
5. `markdownWorkbench.editor.strictLineBreaks` on: single newlines in
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
3. Add `"archive/"` to `markdownWorkbench.vault.excludedFiles`: links to it
   still open, but the quick switcher and search no longer list it.
4. Create `Sub/.obsidian/` and `Sub/Inner.md` containing `[[Target]]`: it is
   unresolved there (a separate vault). Remove the marker and reload: it
   resolves. `markdownWorkbench.vault.rootMarkers` changes which folders
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
   `markdownWorkbench.plugins.external` holds its switch; turning it off
   stops it in every panel.

## Feature plugins

### properties

`Properties.md` and two panels of it.

1. The sheet shows text, number, checkbox, date, date-time, list, tags,
   aliases and link values, as in Obsidian.
2. **Add File Property** (palette or Mod+;) adds a row and focuses its
   name; duplicate names are refused. Rename and delete rows; the body and
   YAML comments survive.
3. Edit each type; Escape cancels, Enter, blur and Mod+S commit. Invalid
   number/date drafts block saving. One undo restores each change.
4. Keep a text draft focused (also during IME composition) while the other
   panel changes another row: the draft stays.
5. Add, remove and edit list chips, including duplicate values, while the
   other panel edits the list: the intended item changes.
6. Select rows with Shift/Alt, copy, cut and paste into another note;
   malformed structured data never enters the text.
7. Sort from the heading menu; drag a row through scrolling and drop once;
   Escape cancels a drag.
8. Change a property's type from its menu and accept or decline the
   conversion; the type persists across reloads and panels of the vault.
9. `markdownWorkbench.properties.display`: `visible`, `hidden` (sheet
   hidden), `source` (YAML shown). Arrow keys and Tab move between title,
   rows and body.

### inlineTitle

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
   `markdownWorkbench.files.newNoteFolder` when set). `[[Home]]` stays
   unresolved (an alias is not a file name), as in Obsidian.
4. HTTPS and mail links open externally; `obsidian://` asks first.
5. **Insert Wikilink** wraps the selection; undo restores it.
6. `markdownWorkbench.links.folderNote` sets the note a folder link opens.
   `markdownWorkbench.links.newLinkFormat` and
   `markdownWorkbench.links.useWikilinks` shape links inserted by
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
   `markdownWorkbench.onlineVideos.bilibiliPlayer` to true: the Bilibili
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

1. Click a cell and type; Tab/Shift+Tab move between cells, Enter moves
   down, Shift+Enter inserts `<br>`, arrows at the edge leave the table.
   Escaped pipes stay valid.
2. Select a range by dragging or Shift+arrows; copy, cut and paste TSV.
   One undo restores each operation.
3. Run **Insert Table** and every **Table:** command (insert, delete and
   move rows and columns, align, sort) from the palette and the menu.
4. Drag a row and a column handle while scrolling; drop once: exactly one
   move. Escape cancels a drag.
5. With Vim on, move between note and cells in normal and insert mode.

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
   counts. `markdownWorkbench.tags.viewSort` (`name`, `frequency`) and
   `markdownWorkbench.tags.viewNested` change it. Typing a new tag without
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

1. With a workbench note active, the Explorer's **Note Outline** lists its
   headings; clicking one moves the caret there, and the current section is
   selected as the caret moves.
2. In the text editor, Note Outline hides; VS Code's Outline lists headings
   once.

### backlinks and outgoingLinks

Both are off by default (owner decision). Turn on
`markdownWorkbench.plugins.backlinks.enabled` and
`markdownWorkbench.plugins.outgoingLinks.enabled` first.

1. Open `Target.md`: **Backlinks** lists Links, Welcome and Search with a
   context line each, and **Unlinked mentions** lists notes that mention
   "Target" without linking. The status bar shows the backlink count.
2. Click a context line: the note opens at the link.
3. **Outgoing Links** for `Links.md` lists its targets and `Missing note`
   under not created yet.
4. Edit a note to add a link without saving: both views update; closing
   without saving reverts them. Turning the switches off hides the views.

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
2. `markdownWorkbench.linkUpdates.mode`: `always` skips the dialog,
   `never` changes nothing.

### folding

`Core.md`.

1. Use the gutter, **Fold All**, **Unfold All** and **Toggle Fold**.
   Heading folds stop at the next heading of the same level; list folds
   include children. Reload: folds are restored.
2. `markdownWorkbench.folding.heading` and `markdownWorkbench.folding.indent`
   act independently.

### lineNumbers

On by default.

1. Open `Formatting.md` in the workbench and, beside it, with **Open With >
   Text Editor**, in a light and a dark theme: the numbers use the same font,
   size, colours (brighter on the caret line), right alignment and gutter
   width, with fold chevrons between numbers and text on hover. Each number
   sits level with its line, including headings.
2. A rendered block (table, callout, math, diagram) lists the numbers of all
   the source lines it covers; no number is skipped. Inserting and deleting
   lines renumbers.
3. Set `editor.lineNumbers` (or `[markdown]` `editor.lineNumbers`) to `off`,
   `relative` and `interval`: the gutter follows without reopening.

### indentGuides

1. Nested lists in `Core.md` show guides that follow tab stops; they never
   cover text.

### spellcheck

1. Misspelled words are underlined (the dictionary is the OS's); off
   removes underlines.

### autoPair

1. Brackets, quotes and Markdown markers (`**`, `==`, `` ` ``) pair and wrap
   selections; Backspace removes an empty pair.
   `markdownWorkbench.autoPair.brackets` and
   `markdownWorkbench.autoPair.markdown` switch the two families.

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

### vim

Off by default.

1. Normal, insert and visual modes; `:w`, `:q`, `:wq`, `:x`, `:u`, `:red`
   use VS Code's save, close and undo. IME in normal mode inserts nothing.
2. With Vim on, Mod+O, B, I, K, Shift+X, Shift+T, Shift+H and Alt+0–6 reach
   Vim instead of VS Code; with Vim off they do not.

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
5. Turn it off in `markdownWorkbench.plugins.external` or uninstall it:
   markers, link handling, the fence renderer and the command go away
   without touching built-in plugins. **Show Plugin Status** lists it as
   external.

<!-- command-setting-inventory:start -->
## Complete command and setting acceptance inventory

Use the disposable fixture vault from Setup. These rows enumerate every generated command and setting. No Obsidian observation is implied. All verify shortcuts remain unbound.

| Command | Default keys | Procedure and expected outcome |
| --- | --- | --- |
| `markdownWorkbench.insertCallout` — Insert Callout | unbound | On a disposable fixture, run Insert Callout; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.save` — Save | unbound | On a disposable fixture, run Save; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.undo` — Undo | unbound | On a disposable fixture, run Undo; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.redo` — Redo | unbound | On a disposable fixture, run Redo; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.close` — Close | unbound | On a disposable fixture, run Close; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.saveClose` — Save and Close | unbound | On a disposable fixture, run Save and Close; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.openAsText` — Open as Text | unbound | On a disposable fixture, run Open as Text; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.copyLinkForAgent` — Copy Link for Agent | none | Select two lines, right-click → Copy Link for Agent. VS Code with only a chat extension (e.g. Copilot Chat): chat opens with `@Note.md#a-b` and the quoted passage prefilled, cursor after it. Cursor with no Claude Code/Codex extension: a new agent chat opens and a notice says the passage is copied; paste shows the same payload. With Claude Code or Codex installed (and `copyLinkForAgent.target` = `auto`), nothing opens: a notice says the passage is copied to paste into your agent. With no chat installed, the same. |
| `markdownWorkbench.titleActions` — Note Actions | unbound | On a disposable fixture, run Note Actions; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.selectionActions` — Selection Actions | unbound | On a disposable fixture, run Selection Actions; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.useForMarkdownInWorkspace` — Use Markdown Workbench for Markdown in This Workspace | unbound | On a disposable fixture, run Use Markdown Workbench for Markdown in This Workspace; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.insertEmbed` — Insert Embed | unbound | On a disposable fixture, run Insert Embed; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.foldAll` — Fold All | unbound | On a disposable fixture, run Fold All; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.unfoldAll` — Unfold All | unbound | On a disposable fixture, run Unfold All; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.toggleFold` — Toggle Fold | unbound | On a disposable fixture, run Toggle Fold; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.insertFootnote` — Insert Footnote | unbound | On a disposable fixture, run Insert Footnote; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.toggleBold` — Toggle Bold | ctrl+b (Mac cmd+b) | On a disposable fixture, run Toggle Bold; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.toggleItalics` — Toggle Italics | ctrl+i (Mac cmd+i) | On a disposable fixture, run Toggle Italics; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.toggleStrikethrough` — Toggle Strikethrough | unbound | On a disposable fixture, run Toggle Strikethrough; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.toggleHighlight` — Toggle Highlight | unbound | On a disposable fixture, run Toggle Highlight; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.toggleCode` — Toggle Inline Code | unbound | On a disposable fixture, run Toggle Inline Code; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.toggleComment` — Toggle Comment | unbound | On a disposable fixture, run Toggle Comment; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.insertLink` — Insert Link | ctrl+k (Mac cmd+k) | On a disposable fixture, run Insert Link; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.insertHorizontalRule` — Insert Horizontal Rule | unbound | On a disposable fixture, run Insert Horizontal Rule; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.toggleBulletList` — Toggle Bullet List | unbound | On a disposable fixture, run Toggle Bullet List; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.toggleNumberedList` — Toggle Numbered List | unbound | On a disposable fixture, run Toggle Numbered List; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.toggleBlockquote` — Toggle Blockquote | unbound | On a disposable fixture, run Toggle Blockquote; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.swapLineUp` — Swap Line Up | unbound | On a disposable fixture, run Swap Line Up; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.swapLineDown` — Swap Line Down | unbound | On a disposable fixture, run Swap Line Down; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.setHeading0` — Set Heading 0 | unbound | On a disposable fixture, run Set Heading 0; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.setHeading1` — Set Heading 1 | unbound | On a disposable fixture, run Set Heading 1; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.setHeading2` — Set Heading 2 | unbound | On a disposable fixture, run Set Heading 2; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.setHeading3` — Set Heading 3 | unbound | On a disposable fixture, run Set Heading 3; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.setHeading4` — Set Heading 4 | unbound | On a disposable fixture, run Set Heading 4; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.setHeading5` — Set Heading 5 | unbound | On a disposable fixture, run Set Heading 5; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.setHeading6` — Set Heading 6 | unbound | On a disposable fixture, run Set Heading 6; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.insertWikilink` — Insert Wikilink | unbound | On a disposable fixture, run Insert Wikilink; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.followLink` — Follow Link | unbound | On a disposable fixture, run Follow Link; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.openLinkToSide` — Open Link to Side | unbound | On a disposable fixture, run Open Link to Side; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.toggleSourceMode` — Toggle Live Preview/Source Mode | unbound | On a disposable fixture, run Toggle Live Preview/Source Mode; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.toggleInlineMath` — Toggle Inline Math | unbound | On a disposable fixture, run Toggle Inline Math; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.insertMathBlock` — Insert Math Block | unbound | On a disposable fixture, run Insert Math Block; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.addProperty` — Add File Property | ctrl+; (Mac cmd+;) | On a disposable fixture, run Add File Property; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.managePlugins` — Manage Plugins | unbound | On a disposable fixture, run Manage Plugins; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.showPluginStatus` — Show Plugin Status | unbound | On a disposable fixture, run Show Plugin Status; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.quickSwitcher` — Quick Switcher | unbound | On a disposable fixture, run Quick Switcher; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.insertTable` — Insert Table | unbound | On a disposable fixture, run Insert Table; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.tableInsertRowAbove` — Table: Insert Row Above | unbound | On a disposable fixture, run Table: Insert Row Above; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.tableInsertRowBelow` — Table: Insert Row Below | unbound | On a disposable fixture, run Table: Insert Row Below; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.tableInsertColumnLeft` — Table: Insert Column Left | unbound | On a disposable fixture, run Table: Insert Column Left; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.tableInsertColumnRight` — Table: Insert Column Right | unbound | On a disposable fixture, run Table: Insert Column Right; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.tableDeleteRow` — Table: Delete Row | unbound | On a disposable fixture, run Table: Delete Row; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.tableDeleteColumn` — Table: Delete Column | unbound | On a disposable fixture, run Table: Delete Column; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.tableMoveRowUp` — Table: Move Row Up | unbound | On a disposable fixture, run Table: Move Row Up; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.tableMoveRowDown` — Table: Move Row Down | unbound | On a disposable fixture, run Table: Move Row Down; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.tableMoveColumnLeft` — Table: Move Column Left | unbound | On a disposable fixture, run Table: Move Column Left; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.tableMoveColumnRight` — Table: Move Column Right | unbound | On a disposable fixture, run Table: Move Column Right; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.tableAlignLeft` — Table: Align Left | unbound | On a disposable fixture, run Table: Align Left; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.tableAlignCenter` — Table: Align Center | unbound | On a disposable fixture, run Table: Align Center; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.tableAlignRight` — Table: Align Right | unbound | On a disposable fixture, run Table: Align Right; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.tableSortAscending` — Table: Sort Ascending | unbound | On a disposable fixture, run Table: Sort Ascending; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.tableSortDescending` — Table: Sort Descending | unbound | On a disposable fixture, run Table: Sort Descending; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.toggleChecklist` — Toggle Checklist Status | unbound | On a disposable fixture, run Toggle Checklist Status; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.cycleListChecklist` — Cycle List Checklist | unbound | On a disposable fixture, run Cycle List Checklist; confirm its named action using the plugin scenarios above, then undo where applicable. Repeat after disable/re-enable and switching panes. |
| `markdownWorkbench.consumeVimHostShortcut` — Consume Vim Host Shortcut | ctrl+o (Mac cmd+o); ctrl+b (Mac cmd+b); ctrl+i (Mac cmd+i); ctrl+shift+x (Mac cmd+shift+x); ctrl+k (Mac cmd+k); ctrl+alt+0 (Mac cmd+alt+0); ctrl+alt+1 (Mac cmd+alt+1); ctrl+alt+2 (Mac cmd+alt+2); ctrl+alt+3 (Mac cmd+alt+3); ctrl+alt+4 (Mac cmd+alt+4); ctrl+alt+5 (Mac cmd+alt+5); ctrl+alt+6 (Mac cmd+alt+6); ctrl+shift+t (Mac cmd+shift+t); ctrl+shift+h (Mac cmd+shift+h) | Enable Vim and press the listed keys; host commands must not steal them. This helper stays hidden from the palette. |

| Setting | Default | Procedure |
| --- | --- | --- |
| `markdownWorkbench.plugins.autoPair.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.backlinks.enabled` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.callouts.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.codeBlocks.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.copyLinkForAgent.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.diagrams.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.embeds.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.onlineVideos.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.folding.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.footnotes.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.formatting.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.indentGuides.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.inlineTitle.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.lineNumbers.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.linkUpdates.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.links.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.math.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.outgoingLinks.enabled` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.outline.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.pagePreview.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.pasteHtml.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.properties.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.quickSwitcher.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.search.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.smartLists.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.spellcheck.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.suggest.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.tables.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.tags.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.tasks.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.vim.enabled` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.wordCount.enabled` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.autoPair.brackets` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.autoPair.markdown` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.editor.defaultMode` | `"livePreview"` | livePreview / source; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.editor.readableLineLength` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.editor.reclaimTextEditor` | `"auto"` | auto/on/off; in Cursor click **Markdown** in the Preview \| Markdown switch and confirm the note returns to Markdown Workbench; **Open as Text** and a second switch within 10 s keep the text editor; set `off` and confirm the text editor stays. |
| `markdownWorkbench.editor.strictLineBreaks` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.editor.rightToLeft` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.editor.useTabs` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.editor.tabSize` | `4` | integer; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.folding.heading` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.folding.indent` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.linkUpdates.mode` | `"prompt"` | prompt / always / never; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.links.newLinkFormat` | `"shortest"` | shortest / relative / absolute; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.links.useWikilinks` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.links.folderNote` | `""` | string; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.files.newNoteFolder` | `""` | string; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.files.attachmentFolder` | `""` | string; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.properties.display` | `"visible"` | visible / hidden / source; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.onlineVideos.bilibiliPlayer` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.tags.viewSort` | `"name"` | name / frequency; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.tags.viewNested` | `true` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.vault.rootMarkers` | `[".obsidian"]` | array; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.vault.excludedFiles` | `[]` | array; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.copyLinkForAgent.target` | `auto` | `claudeCode`: Copy Link for Agent opens a new Claude Code conversation with the passage typed in. `codex`: the Codex sidebar opens with the passage attached as a file (and copied). `chat`/`cursor`: that chat even with other agents installed. `clipboard`: only copies. A target that is not installed only copies. |
| `markdownWorkbench.debug.logging` | `false` | boolean; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.plugins.external` | `{}` | object; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |
| `markdownWorkbench.preset` | `"obsidian"` | obsidian / minimal; change at workspace-folder scope, verify the owning plugin scenario, then reset the override. |

Attachment folder is a validated destination policy; this release keeps pasted image links and does not import attachment files. `links.useWikilinks` changes suggestion acceptance; explicit Insert Wikilink retains wiki syntax. Strict line breaks affects rendered Markdown; source text and its line boundaries remain intact. Default mode affects newly opened panes, not restored pane state.
<!-- command-setting-inventory:end -->
