# Handover, 2026-10-09

State of branch `continue-handover` (PR against `main`) and what remains.
Read AGENTS.md, DESIGN.md and IMPLEMENTATION_PLAN.md (the Phase 7
completion and Phase 8 records) first.

## Done

- Phases 0–8. Phase 7 and 8 records are in IMPLEMENTATION_PLAN.md. Checks:
  `pnpm check` 564/564, browser smoke 26/26, native smoke 2/2 against the
  packaged VSIX in VS Code and in Cursor 3.24.9.
- §5.7 logging (`src/host/logging.ts`, `src/plugins/editor/logging.ts`),
  §6.5 **Manage Plugins** and **Show Plugin Status**
  (`src/host/api/management.ts`), §25.2 **Use Markdown Workbench for
  Markdown in This Workspace** (`src/plugins/editor/associations.ts`). The
  `codex/logging-wip` branch is superseded and can be deleted.
- API.md, `dist/api` declarations (type-checked by
  `test/unit/api/declarations.test.ts`), the sample external plugin
  (`test/fixtures/sample-plugin/`, built by `pnpm sample`).
- `pnpm package` with an allowlist `.vscodeignore` and generated
  `THIRD_PARTY_NOTICES.md` (`pnpm notices` regenerates it after dependency
  changes; `pnpm package` fails while it is stale).
- README, CAPABILITIES.md, CHANGELOG.md, and `docs/MANUAL_TEST_PLAN.md`
  rewritten by plugin, starting with an isolated-profile install.
- Fixes, each with a unit test: application-scheme links in rendered blocks,
  setext underlines, nested quote bars, checked-task styling in Live Preview
  (`data-task` on lines, checkboxes and list items), line numbers beside
  rendered blocks. DESIGN §13/§19, PARITY.md and plugin READMEs corrected.
- Footnotes are LaTeX paper style by owner decision, an intentional
  departure from Obsidian (supersedes ac66543 and 21bde75, which matched
  Obsidian's `[^label]` superscripts): a reference is a superscript number
  in the text colour (about 0.7em, raised about 0.35em, no gap), numbered
  by first reference, named labels too, a repeat reusing its number. A
  selection or Ctrl+A keeps it rendered; only a caret inside its source
  shows the faint `[^label]`. A definition shows its number before its text
  in a slightly smaller block, the faint `[^label]:` only with the caret on
  the marker. Hover previews and click-to-definition kept. Screenshots:
  `/workspace/obsidian-compare/41-*` (before) and `43-*` (after).
- Ctrl/Cmd+A selects the whole note (1f6ece2). VS Code forwards every
  webview keydown to the workbench, whose Select All then ran
  `execCommand("selectAll")` in the page after CodeMirror had selected the
  note, leaving the title selected and a caret at the end. A Select All the
  editor handled now stops at the document, before VS Code's window
  listener. Native test passes in VS Code 1.141 and Cursor 3.24.9 (and
  fails without the fix).
- The footnote hover preview stays inside the webview (dba6658): it moves
  left at the right edge and opens above near the bottom. Browser test
  `test/browser/footnotes.spec.ts`.
- Online Videos plugin (`src/plugins/onlineVideos/`, not in Obsidian;
  c8ac25a, then covers and titles): image-style YouTube (watch, youtu.be,
  Shorts, embed, live, `t=`) and Bilibili (BV, av, `?p=`) links show as
  cards with **Open on YouTube/Bilibili** (buttons calling the links RPC,
  external browser). In trusted workspaces the extension host looks up
  title, author, length and cover (Bilibili's public view API, YouTube
  oEmbed; no keys) and passes the Bilibili cover as a checked, size-limited
  `data:` URL, so the CSP is unchanged; alt text still wins as the title.
  Nothing is requested in untrusted workspaces; any failure leaves the
  plain card. No player by default: neither plays in a VS Code 1.141
  webview (YouTube error 153, no referrer from a non-http origin;
  Bilibili's player never buffers). **Play here** for Bilibili is kept
  behind `markdownWorkbench.onlineVideos.bilibiliPlayer` (false) until the
  owner decides whether to delete it. The Render sanitizer is unchanged: it
  already admits https iframes written in note HTML, sandboxed, in trusted
  workspaces only. Details in the plugin README; browser tests
  `test/browser/online-videos.spec.ts`; fixture note `Videos.md`.
- The editor follows Obsidian's default look with plain CSS:
  `src/webview/styles/` plus one `<plugin>.css` per plugin. Do not
  reintroduce `EditorView.baseTheme` style objects.
- Backlinks and Outgoing Links are off by default (owner decision).
- Owner-decided defaults: line numbers on, Mermaid on, readable line length
  off (DESIGN §15.1).

### Obsidian 1.14 comparison follow-up (each fix with a unit test)

- Editing: Tab/Shift+Tab indent in the note (9a3e55c); smart Enter and
  Backspace in lists (50e7b47); find and replace bar with a match count on
  Ctrl/Cmd+F (f7105ac); Ctrl/Cmd+B, I and K apply once (8a24c2e).
- Rendering: block math reveals its source above the preview (281ade2);
  indented code blocks (0ab6231); faint revealed markers (8689def); list
  indent steps, guides, muted markers and hanging indents (8c8f26d); quote
  text at normal colour (514fee8); inline HTML such as `<kbd>` and `<u>`
  (40376cb); code language label (7175a63); external-link mark (67aa7d6);
  faint block IDs (cc92832); callout titles and padding (aae7e8b, c121e62);
  wide tables scroll in their own box (52b6a3c); missing-embed text
  (0fdbf93); link hover card (48c2b65).
- Line numbers laid out like VS Code's gutter, on by default (00f456f);
  note text follows `editor.fontFamily`/`editor.fontSize` (3b78faf).
- Link updates read offsets from the open document and save notes they
  edit after a rename (b335772).

### Cursor

- `markdownWorkbench.editor.reclaimTextEditor` (`auto` = on in Cursor,
  bf77ed1): when Cursor's own Markdown switch, or its remembered per-file
  choice, sends a note to the text editor, the note reopens here. README
  "In Cursor" explains the workspace association that wins over Cursor's
  built-in Markdown editor for new opens.
- Typing could insert twice in Cursor (b8a7dff): Cursor can send a change
  event with no new text before an edit lands; the session took it for
  the panel's edit and recorded the real one as a host edit, so the panel
  resent it. Such events are now ignored. The native suite passed 6/6
  against Cursor 3.24.9 afterwards (it failed about 1 in 3 before).
- Native tests find Cursor's `bin/cursor` and its visible quick-input box
  (2d5de13). Run against Cursor with
  `VSCODE_EXECUTABLE=<cursor>/usr/share/cursor/cursor xvfb-run -a pnpm test:vscode`.
- Ctrl+I in a Markdown Workbench note italicises in Cursor (checked by
  hand). Ctrl+Z right after using the agent pane can go to the agent input
  instead of the note, which is Cursor's global undo routing; Edit: Undo
  and Ctrl+Z after clicking into the note work.

### Copy for Agent and Ask Agent about Selection (0dd4d09, 86152c3)

- Copy for Agent (Ctrl/Cmd+Alt+C) copies `@Note.md#a-b`, a blank line and
  the selected passage quoted with `> `.
- **Ask Agent about Selection** (selection menu and editor context menu)
  opens Cursor's agent chat with that payload on the clipboard (Cursor
  offers no prefill) and a notice saying so; in VS Code it opens the chat
  view prefilled with the payload and the caret after it, ready for the
  question; with no chat, it copies and says so.
- Friction, VS Code: before, select, Ctrl+Alt+C, open chat, paste, type
  the question, and the agent had to open the file to see the words (an
  agent without file access answered "I can't see the contents"). After:
  select, right-click, Ask Agent about Selection, type the question. In
  Cursor, one paste remains.
- Local round trip with DeepSeek (`deepseek-flash`, OpenAI-compatible
  chat/completions; script kept outside the repo in
  `/tmp/mdwb-tools/ask-deepseek.mts`, key read from `DEEPSEEK_API_KEY` and
  never printed). Selection: the first table of `Tables.md`, question
  "What is in the last row of this table?". Reference only
  (`@Tables.md#3-7`): "I can't see the contents of `Tables.md#3-7`, so I
  can't quote the last row's cell values." With the payload: "The last row
  is "Cherry", "Red", "3.00", "yes"." (4/4 cells).

## Remaining

1. Phase 9, owner acceptance: run `docs/MANUAL_TEST_PLAN.md` against the
   VSIX and fill `docs/PARITY.md`. Nothing in it has been run by hand.
2. Visual differences seen beside Obsidian but not yet changed (check them
   in the acceptance pass first):
   - Fold chevrons show whenever the pointer is over the editor; Obsidian
     shows them on the hovered line only.
   - Line numbers beside tall block widgets (tables, callouts) sit close
     together at the widget's top.
   - A reference such as `@Note.md#30-32` that an agent links back opens
     the note but not at that range: custom editors get no selection from
     VS Code's open options.
3. Cursor: switching a note to Markdown twice within 10 s is meant to keep
   it as text (unit-tested); not confirmed by hand because the second click
   on Cursor's switch did nothing in the isolated profile.
4. The new commands (Manage Plugins, Show Plugin Status, Use Markdown
   Workbench for Markdown in This Workspace) and logging are unit-tested
   against the VS Code fake; the native smoke does not exercise them.
5. `scripts/test-ledger.mjs` needs the source checkout
   (`~/Code/human-learning`), which was not available; the ledger was not
   regenerated (it has no `todo` rows).
6. Deferred by design: performance measurement (DESIGN §20), webview-side
   external plugins (§18.5), Reading view (§25.8), heading-rename link
   updates.

## Rules

- Before each commit, run `pnpm check`. Also run `pnpm test:browser` when
  webview code changes, and `pnpm test:vscode` for native wiring and
  packaging. Never run two at once. On a shared machine run the native
  suite under `xvfb-run -a`.
- Follow AGENTS.md's code norms. Never raise a limit, add a lint exception
  or weaken a test: `test/unit/lint-rules.test.ts` enforces this. A bug fix
  gets its own commit and a unit test.
- Never modify ~/Code/human-learning (the source being ported, at ff3a902e)
  or ~/Code/vscode-embedPDF. Reading them is fine.
- Obsidian is a behaviour reference only. Never copy its code, CSS or
  assets, and never open the owner's vaults.
- Native tests use isolated `/tmp` profiles, never the owner's VS Code or
  Cursor profiles.
- Leave "verify" key bindings unbound.
- CI (`.github/workflows/ci.yml`) runs `pnpm check`, the browser suite, the
  native suite in VS Code stable under xvfb, packaging with VSIX checks, a
  gitleaks scan and an advisory `pnpm audit`; see README, "CI and quality
  gates". CI has no secrets: the DeepSeek round trip stays local.
