# Handoff: testing Workshop in Cursor with computer use

For Claude Desktop with computer use, testing on the owner's Mac. Written
2026-10-18 on branch `claude/cordis-core-and-parity` (draft PR #83). The
full scenario list is [packages/markdown/docs/MANUAL_TEST_PLAN.md](../packages/markdown/docs/MANUAL_TEST_PLAN.md);
this page picks the checks that matter most and says how to run them here.

## Handoff to Grok Bot — 2026-10-18, 06:10 PDT

The owner stopped all Claude sessions and handed debugging to Grok Bot. This
section is the current state; the sections after it are the original test
plan, still valid. The plan's "don't change the repository" rule is for
testing; to fix bugs, follow [AGENTS.md](../AGENTS.md) (each fix in its own
commit with a unit test) and don't push without the owner.

### Your task: Vim input bugs

The owner reports "a lot of bugs when inputting in Vim mode", with no
specific cases yet. Vim is on in the owner's Cursor (user setting
`markdownWorkshop.plugins.vim.enabled: true`). Leads:

- The web-build session saw "CodeMirror plugin crashed: Disposed: tables is
  stopped" when opening a note: the tables plugin's Vim table-entry
  ViewPlugin reads `ctx.vim` after the plugin restarts (when an optional
  service such as `links` arrives later). A race in
  `packages/markdown/src/plugins/tables` (`vim-entry.ts`), not fixed.
- After clicking an inline formula (which selects it, so Vim is in visual
  mode), a click on a display formula selects its source but leaves it
  rendered; a second click reveals it. `packages/markdown/src/plugins/math`.
- Obsidian 1.14's Vim, measured: `packages/markdown/docs/obsidian-measurements/tables/vim-obsidian.md`
  and the scripts beside it. A disposable Obsidian 1.14.4 runs with
  `--user-data-dir=/tmp/obsidian-probe/config` and DevTools on port 9333
  (vault `/tmp/obsidian-probe/vault`); its window is hidden — show it through
  Electron (`require("@electron/remote").getCurrentWindow().show()`) before
  measuring anything visual.
- Browser harness (Chromium, typing allowed): `packages/markdown/test/browser`
  (`harness.ts`, `open(page, source, preset, { features })`); the Vim specs
  are `tables-vim.spec.ts`, `vim-*.spec.ts`.
- Claude's computer use can only click in Cursor, never type; Grok Bot may
  be able to type, which is what these bugs need.

### Repository

- Branch `claude/cordis-core-and-parity` in
  `~/Code/vscode-workshop/vscode-markdown-workshop`, pushed to `origin`, now
  `t04dJ14n9/lumiere` (the owner renamed the GitHub repository; draft PR
  #83).
- The owner asked for the push before the pre-push check finished: unit
  tests (2,446) and the Markdown browser suite (284) pass on `9d5f473`; the
  PDF browser suite failed only because another worktree's run held its
  server on port 8990 (Playwright `reuseExistingServer`); `test:vscode` has
  not run on these commits. See the to-do list.
- The commits pushed on 2026-10-18: no space above line 1; vault-index saves
  one at a time; blame drawn as an overlay above the text; a glow (not a fill) on the
  table cell being edited; PDF page and zoom kept in Cursor's status bar;
  tags follow Obsidian 1.14.4's grammar; a note's tab closes after Cursor's
  Preview | Markdown switch; the README for Lumière; the record in
  `packages/markdown/IMPLEMENTATION_PLAN.md`; the vault worker found in
  `dist/markdown/workers`; cached vaults parsed again after the tag change
  (`SNAPSHOT_VERSION` 4, pinned by `snapshot-version.test.ts`).
- Other branches, each in its own worktree, pushed to `origin` but not
  merged:
  `claude/web-extension` (`~/Code/vscode-workshop/vscode-markdown-workshop-web`,
  a browser build for a GitHub Pages demo; its session was stopped mid-turn)
  and `claude/math-fixes` (`…-math`, blank list-item math and `\mathbb`).
- Run test suites one at a time across all worktrees; several sessions
  colliding on ports and focus cost a run today.

### What is installed now

- Mac Cursor and the owner's CVM (`ssh cvm_dev_machine`, vault `~/WorkVault`
  through Remote-SSH) both run `t04dj14n9.vscode-workshop` 0.1.0 built from
  `9d5f473`. Each window needs **Developer: Reload Window** to load it.
- Reinstall: `pnpm package`, then on the Mac
  `/Applications/Cursor.app/Contents/Resources/app/bin/cursor --install-extension vscode-workshop-0.1.0.vsix --force`;
  on the CVM copy the VSIX over and run
  `~/.cursor-server/bin/linux-x64/<commit>/bin/cursor-server --install-extension <vsix> --force`.
  Remote windows use the CVM's copy, not the Mac's.
- Old builds were uninstalled; backups are in
  `~/Code/vscode-workshop/old-cursor-extensions-2026-10-18/` (Mac) and
  `~/workshop-old-extensions-2026-10-18/` (CVM).

### Checked in real Cursor today

- Pass: checks 1, 2, 3, 4 (click half), 5, 13 and 15 below; blame on a
  heading and an empty line (hidden, by design, when under ten ems fit
  after a long line); the edited table cell's glow; the Tags pane against
  Obsidian's rule; PDF page and zoom in the status bar at normal window
  width, with zoom-out staying put.
- Not done: checks 4 (keys), 6–12 and 14, which need typing or dragging.

### Known open issues

- A note opened as text before the extension started (passed on the
  command line, or restored with the window) stays in the text editor;
  reclaim only acts on tab changes after activation.
- RPC timeouts log only the method name (`Error: ready`,
  `Error: captureCursor`): `RpcError` drops its code. On the CVM a note once
  opened blank after `Editor bootstrap failed Error: ready`.
- In `Links.md` line 14 a list item's continuation line is drawn left of its
  bullet; not compared with Obsidian yet.
- Cursor's own **Preview | Markdown** switch shows above Workshop notes, with
  "Markdown" selected.
- "Your Cursor installation appears to be corrupt" comes from a patch to
  Cursor's `workbench.desktop.main.js` (Oct 14, `.orig` backups beside it),
  not from Workshop.

### Owner's settings to know about

- User settings turn blame off (`markdownWorkshop.plugins.gitBlame.enabled:
  false`) and still map `*.md` to `markdownWorkbench.editor`, the removed
  build; the owner has not asked to change them.
- The test vault `~/Code/vscode-workshop/workshop-test-vault` is now a git
  repository (two commits, author Workshop-Test) so blame has history. Its
  `.vscode/settings.json` maps `*.md` to Workshop, turns on debug logging and
  turns blame on. `Tag probe.md` and `Blame probe.md` are probes from today.
- Workshop's log: Cursor's logs folder, `window*/exthost/t04dj14n9.vscode-workshop/Workshop.log`.

### To do

- [ ] **Vim input bugs** (the owner's report; leads above).
- [ ] **Finish the pre-push check** on the pushed commits:
      `PORT=8991 pnpm --filter @workshop/pdf test:browser`, then
      `pnpm test:vscode`, with no other suite running.
- [ ] **Rename the code to Lumière**: display name "Lumière: Markdown Editor
      and PDF Reader"; description "Obsidian-style Live Preview for Markdown
      and a PDF reader, in VS Code and Cursor, with links your AI agent can
      follow."; keywords (markdown, pdf, obsidian, live preview, notes,
      wikilinks, markdown editor, pdf viewer, pdf reader, vscode, cursor, ai,
      agent); extension ID `t04dj14n9.lumiere`; setting prefixes
      `lumiere.markdown.*` and `lumiere.pdf.*` (each product keeps its own);
      command titles and categories; editor names ("Lumière PDF"); the VSIX
      name; the repository URL in `package.json`
      (`https://github.com/t04dJ14n9/lumiere`). Then move the owner's
      settings to the new keys and reinstall on the Mac and the CVM.
- [ ] **Review and merge `claude/math-fixes`** (blank list-item math and
      `\mathbb` in Live Preview).
- [ ] **Review `claude/web-extension`** (a browser build for a GitHub Pages
      demo). Its worktree still has uncommitted changes (`.gitignore`,
      `eslint.config.mjs`, `demo/`); its Code-OSS source build failed in
      `npm ci` with `ECONNRESET`; its session is paused for the owner.
- [ ] **Demo**: `t04dJ14n9/lumiere-demo` (Codespaces) works and stays
      private until the math fixes and a renamed VSIX are in it.
- [ ] **Keyboard checks** 4 (keys), 6–12 and 14 in the plan below.
- [ ] **Fix** the tables plugin's Vim entry reading `ctx.vim` after a
      restart ("Disposed: tables is stopped").
- [ ] **Fix** a display formula needing a second click after an inline
      formula was selected.
- [ ] **Fix** reclaim for notes already open as text when the extension
      starts.
- [ ] **Fix** `RpcError` losing its code, so timeouts log as `Error: ready`.
- [ ] **Compare with Obsidian** the list continuation line drawn left of its
      bullet (`Links.md` line 14).
- [ ] **Ask the owner** whether to turn blame back on in their user settings
      and to replace the stale `*.md` → `markdownWorkbench.editor`
      association.

## What was installed when this plan was written

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
