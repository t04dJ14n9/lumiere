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
  off (DESIGN §15.1), inline title off (3993fa5): line 1 starts at the
  top as in VS Code; the plugin and its setting stay.

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
  note text follows `editor.fontFamily`/`editor.fontSize` (3b78faf), now
  as they apply to Markdown files (see "Editor font" below).
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

### Copy Link for Agent (0dd4d09, 86152c3)

- Copy for Agent (its command, Ctrl/Cmd+Alt+C, title button and menu
  items) was removed by owner decision on 2026-10-09 (branch
  `remove-copy-for-agent`): plain Ctrl/Cmd+C covers copying. The remaining
  action, formerly Ask Agent about Selection, is now **Copy Link for
  Agent** (owner decision, same day). It keeps building `@Note.md#a-b`, a
  blank line and the selected passage quoted with `> `, copies it, and
  opens a chat only as before. Nothing was published, so ids were renamed
  with no migration: command `markdownWorkbench.copyLinkForAgent`, plugin
  `copyLinkForAgent` (`markdownWorkbench.plugins.copyLinkForAgent.enabled`,
  context key `markdownWorkbench.plugin.copyLinkForAgent`), setting
  `markdownWorkbench.copyLinkForAgent.target` (was `askAgent.target`). The
  `agent` kernel service is gone, and the public API no longer has
  `createAgentReference`, `copyForAgent`, `AgentReference` or an `agent`
  external-plugin service. `CopyLinkForAgent` (`src/plugins/copyLinkForAgent/agent.ts`) and
  `reference.ts` build the text internally. Plans in `docs/plans/` that
  mention the `agent` service (okf) predate this and need a new seam if
  revived.
- **Copy Link for Agent** (selection menu and editor context menu)
  copies the payload; with `target: auto` it opens a chat only when the
  editor's own chat is the only agent installed. It opens Cursor's agent
  chat with that payload on the clipboard (Cursor offers no prefill) and a
  notice saying so; in VS Code it opens the chat
  view prefilled with the payload and the caret after it, ready for the
  question; with no chat, it copies and says so.
- Friction, VS Code: before, select, Ctrl+Alt+C, open chat, paste, type
  the question, and the agent had to open the file to see the words (an
  agent without file access answered "I can't see the contents"). After:
  select, right-click, Copy Link for Agent, type the question. In
  Cursor, one paste remains.
- Local round trip with DeepSeek (`deepseek-flash`, OpenAI-compatible
  chat/completions; script kept outside the repo in
  `/tmp/mdwb-tools/ask-deepseek.mts`, key read from `DEEPSEEK_API_KEY` and
  never printed). Selection: the first table of `Tables.md`, question
  "What is in the last row of this table?". Reference only
  (`@Tables.md#3-7`): "I can't see the contents of `Tables.md#3-7`, so I
  can't quote the last row's cell values." With the payload: "The last row
  is "Cherry", "Red", "3.00", "yes"." (4/4 cells).

### Stable layout when the caret enters a block (d382903, c93d102, 1feb9c8, 402accc)

- Owner bug: a fenced code block changed height when the caret entered or
  left it (rendered widget vs. source lines with other padding). Code
  blocks (fenced, `~~~`, indented) are now always decorated source lines,
  as in Obsidian: only the fence text hides, the empty fence lines keep
  their line box and hold the language label and Copy button (hover). Prism
  highlighting no longer waits for the caret. Only fences a code processor
  accepts still become a widget (`codeBlocks/processor-view.ts`).
- Horizontal rules are one decorated line too (the rule is drawn on the
  line; the caret shows `---` in the same box). Before, everything below
  moved by about 15px.
- Audit (measured with the caret outside vs. inside): headings, quotes,
  lists, task lists, tables and footnote definitions did not move and are
  now locked by tests. Callouts and block math still change height on
  reveal, as in Obsidian 1.14 (checked on :7: a callout box turns into its
  raw lines; math adds its source lines above an unchanged preview). Math
  is tested to keep its preview height and to move the text below by
  exactly the source lines. Mermaid diagrams also swap to their source
  lines (not compared with Obsidian yet). Keeping callouts or Mermaid in
  place would depart from that behaviour; owner's call.
- Tests: `test/browser/stable-blocks.spec.ts` compares every line's
  offsetTop/height and the scrollHeight with the caret outside and at the
  start, middle and end of each block (failed 9/9 code and rule cases
  before the fix), plus the owner's repro on the vault's `Code.md`: caret on
  the closing fence (line 7), then Down to the blank line 8, and a walk
  with ArrowDown/ArrowUp over every line (both failed before; lines below
  moved about 3px); unit tests `livePreview/code-lines.test.ts` and
  `codeBlocks/code.test.ts`. Checks: `pnpm check` 577/577, browser 44/44,
  native 2/2.

### Editor font (3a7be46)

- Owner question: why the note's font looks odd, and whether it follows
  Cursor's or VS Code's font settings. Both apps work the same way (Cursor is
  a VS Code fork). The note used VS Code's webview variables, which hold only
  the global `editor.fontFamily`/`fontSize`. Measured against the built-in
  text editor on the same note (native probe, VS Code 1.141 and Cursor
  3.24.9 on Linux, defaults: Droid Sans Mono 14px in both):
  - `[markdown]` font overrides were ignored (global 13px instead of the
    Markdown 18px).
  - `editor.fontWeight`, `letterSpacing`, `fontVariations` and
    `lineHeight` were ignored.
  - Ligatures were on in the note but off in the text editor, VS Code's
    default. Fonts like Fira Code or Cascadia Code drew `=>` and `!=` as
    ligatures only in the note.
  - The configured family had no fallback, so a font that isn't installed
    fell back to the browser's serif.
  - Code was 0.875 of the text size in the same face.
- Now the host reads those settings as they apply to Markdown files and the
  editor sets them as CSS variables (`src/plugins/editor/font.ts`):

  | Note property | Follows | Notes |
  | --- | --- | --- |
  | Text and code family | `editor.fontFamily` (`[markdown]` too) | `monospace` fallback added |
  | Text and code size | `editor.fontSize` | code no longer smaller |
  | Weight | `editor.fontWeight` | bold and headings stay bold |
  | Line height | `editor.lineHeight` | default 0 is the text editor's own line height (1a06f65); set values honoured |
  | Letter spacing | `editor.letterSpacing` | |
  | Ligatures | `editor.fontLigatures` | off by default, as in VS Code |
  | Variations | `editor.fontVariations` | |
  | Heading sizes | none | Obsidian's scale (1.618em for H1 and so on) |
  | Menus, popovers | VS Code's global editor font | outside the note |

  `markdownWorkbench.*` has no font settings of its own. Note text in the
  editor's monospace font is the owner's choice (3b78faf).
- Tests:
  - `test/vscode/font.spec.ts` compares the note with the built-in editor
    under `[markdown]` overrides. It failed before the change (13px vs 18px)
    and passes in VS Code and Cursor.
  - Unit tests: `src/plugins/editor/font.test.ts` and
    `test/unit/settings/editor.test.ts`.

### Line height follows the text editor (11afb18, 1a06f65)

- Owner decision (2026-10-09): at `editor.lineHeight` 0 the note uses the
  built-in text editor's line height, not Obsidian's 1.5. `font.ts`
  `lineHeightPixels` copies VS Code's `BareFontInfo` rule: 0 is 1.35 x size
  (1.5 on macOS), below 8 a multiplier, else pixels, rounded, at least 8.
  On Linux 12/14/16/20px give 16/19/22/27px (before: 18/21/24/30). Headings
  keep Obsidian's sizes and line heights; the browser harness (no host size)
  keeps the stylesheet's 1.5.
- Bug found on the way (11afb18): the font variables were an editor
  attribute, and CodeMirror doesn't measure lines again on an attribute
  change. After a live `editor.fontSize` change the line numbers drifted
  (11.6px after 12 -> 20px). The variables are now an `EditorView.theme`,
  which makes CodeMirror measure again. Browser test in
  `stable-blocks.spec.ts`; the fake host has `configureEditor`.
- Native test: `font.spec.ts` "at the default line height ..." splits the
  note beside **Reopen Editor With > Text Editor** and compares text, code
  and line-number heights at 12/14/16/20px (VS Code 1.141 and Cursor
  3.24.9). It failed before the change (18px vs 16px at 12px). In Cursor
  a new split's webview swallowed Ctrl+Shift+P, so `openPalette` in
  `test/vscode/workbench.ts` presses it again until the palette opens.
- Checks: `pnpm check` 582/582, browser 47/47, native 4/4 in VS Code and
  Cursor.

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
