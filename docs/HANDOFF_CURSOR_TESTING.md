# Handoff: testing Workshop in Cursor with computer use

For Claude Desktop with computer use, testing on the owner's Mac. Written
2026-10-18 on branch `claude/cordis-core-and-parity` (draft PR #83). The
full scenario list is [packages/markdown/docs/MANUAL_TEST_PLAN.md](../packages/markdown/docs/MANUAL_TEST_PLAN.md);
this page picks the checks that matter most and says how to run them here.

## What is installed

- The owner's own Cursor runs `t04dj14n9.vscode-workshop` 0.1.0, packaged
  from commit `b364ee8` with `pnpm package`. The owner asked for it in their
  own Cursor, not an isolated profile.
- It replaces three older builds (`vscode-markdown-workshop`,
  `vscode-markdown-workbench`, `vscode-embedpdf`). They are uninstalled, with
  copies in `~/Code/vscode-workshop/old-cursor-extensions-2026-10-18/`.
- `tomoki1207.pdf`, another PDF viewer, is also installed, and both claim
  `*.pdf`. If a PDF opens in the other viewer, use **Open With… › PDF
  Workshop**.
- A newer build installs with `pnpm package`, then
  `/Applications/Cursor.app/Contents/Resources/app/bin/cursor --install-extension vscode-workshop-<version>.vsix`,
  then **Developer: Reload Window** in Cursor.

## Ground rules

- **Test only in the test vault**: `~/Code/vscode-workshop/workshop-test-vault`,
  a copy of the fixture vault. Never open the owner's own notes or vaults.
- **Settings at workspace scope only** (the Workspace tab in Settings), so
  the owner's user settings stay as they are.
- **Don't change the repository.** No commits or pushes. Report results
  (below) and let the owner decide.
- **Treat Obsidian as a reference only.** To compare, open another copy of
  the fixture vault in Obsidian, never the owner's vault.
- **Never type or show API keys or tokens.**

## Computer use limits in Cursor

Claude Desktop grants IDEs, and Cursor is very likely one, at the **click**
tier: screenshots and left clicks work, but typing, key presses,
right-click, modifier-clicks and drags are blocked. The access prompt shows
the tier Cursor got. With the click tier:

- Run the checks marked **click** yourself.
- For checks marked **keys**, ask the owner to press the keys or type the
  text you name, then take a screenshot and judge the result.
- Don't work around the block, for example by pasting from another app.

## Setup in Cursor

1. **File › Open Folder…** and open `~/Code/vscode-workshop/workshop-test-vault`.
2. *(keys)* Run **Markdown Workshop: Use Markdown Workshop for Markdown in
   This Workspace** from the Command Palette (Cmd+Shift+P), so `.md` files
   open in Workshop rather than Cursor's own Markdown editor.
3. *(keys)* In Settings › Workspace, turn on `markdownWorkshop.debug.logging`.
   Open **View › Output** and pick **Markdown Workshop**; note any error lines
   in your results.

## Checks, most important first

Each row names the note in the test vault. "As in Obsidian" means Workshop
should behave the way Obsidian 1.14 does.

| #   | Area                  | Mode  | Steps                                                                                                                              | Expected                                                                                                                                                                                                                                |
| --- | --------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Opening               | click | Click `Welcome.md` in the Explorer.                                                                                                | It opens in Markdown Workshop in Live Preview: headings, lists and links rendered, the Properties block at the top.                                                                                                                     |
| 2   | Links                 | click | Click `[[Core]]` in Welcome. In `Links.md`, click `[[Missing note]]`.                                                              | Core opens. The missing link is dimmed; clicking creates and opens `Missing note.md` (delete it afterwards).                                                                                                                            |
| 3   | Reveal                | click | In `Formatting.md`, click inside the word **bold** on line 3, then on another line.                                                   | Only that word's `**` markers show; the italic and other formatting on the line stay rendered, as in Obsidian. Clicking elsewhere renders it again.                                                                                                                                           |
| 4   | Images                | both  | In `Embeds.md`, click the first diagram (click). Then press `+`, `-`, `0`, Escape (keys).                                                | The click outlines the image and leaves it rendered. `+` writes a width of 225 into the source (`\|225`), `-` steps back, `0` removes the width, Escape lets it go.                                                                    |
| 5   | Rendered blocks       | click | Open `Callouts.md`, `Math.md` and `Diagrams.md`. Click a formula; click a diagram's Edit button.                                   | Callouts, formulas and diagrams render. Clicking a formula shows its source; a diagram shows its source only from its Edit button.                                                                                                     |
| 6   | Tables                | keys  | In `Tables.md`, click a cell, type a word, press Tab, then Tab in the last cell.                                                   | Only that cell shows source; the table source stays aligned. Tab moves to the next cell; Tab in the last cell adds a row.                                                                                                               |
| 7   | Link suggestions      | keys  | On an empty line type `[[Targ`, then `[[Target^`, then `#ide`.                                                                          | `Target` is offered first; `[[Target^` lists Target's blocks, `^key-point` among them (picking one without an id adds one); `#ide` offers `idea`.                                                                                                       |
| 8   | Footnotes             | keys  | In `Footnotes.md`, run **Insert Footnote** at the end of a line and type a few words.                                              | A popover opens under the new reference; what you type goes into the definition at the end of the note. Escape closes it, back at the reference. References show as superscript numbers (LaTeX style, by owner decision).               |
| 9   | Formatting            | keys  | Select a word, press Cmd+B, then run **Toggle Red Highlight**.                                                                     | Cmd+B wraps it in `**`. The highlight writes `==🔴word==`, as Obsidian 1.14 does, and shows it red.                                                                                                                                     |
| 10  | Cursor chat and edit  | keys  | Select a sentence in Live Preview, press Cmd+L; select again, press Cmd+K and ask for a small change, then Accept.                 | Cmd+L opens Cursor's chat with the selection. Cmd+K opens Cursor's edit bar; Accept changes the note in Workshop.                                                                                                                       |
| 11  | Copy Link for Agent   | keys  | In `Core.md`, select two lines and run **Copy Link for Agent**.                                                                                     | The clipboard holds `@Core.md#start-end` (the note's path and lines), a blank line and the quoted text, and a notice says where it went.                                                                                               |
| 12 | Settings | keys | Run **Markdown Workshop: Open Settings**, then close the Settings tab. | Settings opens filtered to `@ext:t04dj14n9.vscode-workshop` within a second or two, and Cursor stays responsive. (Builds before the 2026-10-18 Settings fix froze Cursor's window here for 15 to 75 seconds; if that happens, the installed build is too old.) |
| 13  | PDF viewer            | click | In `Links.md`, click the Sample PDF link. Use the title-bar zoom and fit buttons, the status-bar page number, and the PDF Outline. | The PDF opens in PDF Workshop; the controls work; the outline lists bookmarks if the PDF has any.                                                                                                                           |
| 14  | PDF selection         | drag  | Drag across two lines of PDF text, then over empty page space.                                                                     | The text highlight is an even tint, with no darker stripes where lines meet; a menu offers Copy Link for Agent. Dragging over empty space draws a region box. (Drags need the owner at the click tier.)                                  |
| 15  | Note to PDF           | click | In `Embeds.md`, click the PDF card (`![[attachments/sample.pdf]]`).                                                                | The PDF opens in PDF Workshop.                                                                                                                                                                                                         |

When these pass, continue with the plugin sections of the manual test plan
in the order it lists them.

## Known issues and intended differences

- **Equal suggestion scores.** Suggestions that score exactly the same can
  come in a different order from Obsidian's, which follows each app's own
  file order.
- **Footnotes** are drawn in LaTeX paper style by owner decision, not as
  Obsidian draws them.
- **Two PDF viewers** are installed (see above).

## How to report

For each check, give:

- the number and **pass** or **fail**;
- for a failure: the exact steps, what you expected, what happened, a
  screenshot, and any error lines from the Markdown Workshop output;
- anything that differs from Obsidian, even if it isn't listed above.

Put the results in your reply to the owner, who passes them on to be fixed.
