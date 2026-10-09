# Session handoff: 2026-10-09

This is a skimmable summary for the next session. Details are in the commit messages, PR descriptions, `docs/HANDOVER.md` and `docs/plans/`.

## Goal

Make editing Markdown in VS Code and Cursor feel like Obsidian's Live Preview, with agent-friendly extras. A PDF viewer (vscode-embedPDF) will later become a plugin of the workbench.

## Decisions made today (owner)

| Area | Decision |
| --- | --- |
| Line numbers | **On by default**, laid out like VS Code's gutter and following `editor.lineNumbers` (00f456f). |
| Mermaid | **On** (`plugins.diagrams.enabled = true`, strict mode). |
| Readable line width | **Off** (`editor.readableLineLength = false`). |
| Fonts | Follow `editor.fontFamily` and `editor.fontSize` (3b78faf). |
| Shortcuts | **No custom shortcuts.** Ctrl/Cmd+A selects the whole note (1f6ece2) because this matches the editor. |
| Outlines | Stay as they are. The workbench Outline covers the note, and VS Code's Outline covers the text editor. |
| Footnotes | LaTeX paper style: superscript numbers numbered by first reference. Only a caret (an empty selection) inside a reference reveals the raw `[^label]`; selections keep it rendered (7ce645d). |
| Ask Agent | **Never guesses the agent.** `auto` opens a chat only when the editor's own chat is the only agent installed; otherwise it copies text and links. `markdownWorkbench.askAgent.target` forces a target: `auto`, `cursor`, `chat`, `claudeCode`, `codex` or `clipboard` (0fa88e0, 4147c0d). The PDF viewer behaves the same way (`vscodeEmbedPdf.askAgent.target`). |
| Cursor Markdown button | `markdownWorkbench.editor.reclaimTextEditor` (`auto` means on in Cursor only). A note that Cursor's Markdown switch sends to the text editor reopens in the workbench (bf77ed1). |
| PDF region images | The snapshot cache is capped at **100 MB** and evicts the least recently used files (`vscodeEmbedPdf.regionImageCache.maxSizeMB`, acabd72 and 75f7b21 in vscode-embedPDF). |
| Online videos | YouTube and Bilibili links show as **video cards**, because the players don't run in VS Code webviews. A Bilibili **Play here** button exists behind `onlineVideos.bilibiliPlayer` (off) (c8ac25a, a621ec1). |
| PDF viewer | To be merged into the workbench as an editor plugin. **The name is undecided.** Plan: `docs/plans/plugins-architecture.md`. |
| Planned plugins | The OKF plugin family (`docs/plans/okf-plugins.md`), Markdown lint and git diff (same plan, §6). |
| Showcase | A cloud demo for the GitHub showcase comes later. |

## Repos, branches and PRs

Head commits were checked with `git log` at hand-off time.

| Repo | Branch | Head | PR | Pushed |
| --- | --- | --- | --- | --- |
| t04dJ14n9/vscode-markdown-workbench | `continue-handover` | this docs commit, on de7c0cd | [#1](https://github.com/t04dJ14n9/vscode-markdown-workbench/pull/1) → `main` (open) | yes |
| t04dJ14n9/vscode-embedPDF | `test-and-fix-ui` | 75f7b21 | [#1](https://github.com/t04dJ14n9/vscode-embedPDF/pull/1) → `main` (open) | yes |
| t04dJ14n9/vscode-embedPDF | `agent-handoff-native` | 3141d6f | [#2](https://github.com/t04dJ14n9/vscode-embedPDF/pull/2) **draft** → `test-and-fix-ui`: "Agent handoffs and MCP bridge (prototype)" | yes |
| t04dJ14n9/vscode-embedPDF | `toolbar-research-prototype` | 4840485 | none (research branch on d4a5d8b: toolbar modes, status bar page and zoom, title bar actions) | yes |

Local clones on the box:

| Path | Branch |
| --- | --- |
| `/workspace/repos/vscode-markdown-workbench` | `continue-handover` |
| `/workspace/repos/mdwb-compare` | `continue-handover`, the clone that the :7 VS Code window runs |
| `/workspace/repos/vscode-embedPDF` | `test-and-fix-ui` |
| `/workspace/repos/agent-integration/vscode-markdown-workbench-agents` | `agent-handoff-deepseek`, merged into `continue-handover` |
| `/workspace/repos/agent-integration/vscode-embedPDF` | `agent-handoff-native` |
| `/workspace/repos/embedpdf-toolbar-research` | `toolbar-research-prototype` |

The local branches `backup/*-pre-rebase` are safety copies taken before the rebases. They are not pushed.

## Build and test

Both repos use pnpm. If corepack fails, set `COREPACK_HOME=$HOME/.cache/corepack`. **Run one suite at a time, never in parallel.**

Markdown workbench:

```sh
pnpm install
pnpm check                         # format, lint, typecheck, unit tests, contributions --check
xvfb-run -a pnpm test:browser      # Chromium with a fake host
xvfb-run -a pnpm test:vscode       # real VS Code (or DISPLAY=:7 to watch)
```

vscode-embedPDF:

```sh
pnpm check                         # lint, typecheck, unit tests
xvfb-run -a pnpm test:browser
DISPLAY=:7 pnpm test:vscode        # VS Code stable
VSCODE_EXECUTABLE=/workspace/tools/cursor-3.24.9/squashfs-root/usr/share/cursor/cursor DISPLAY=:7 pnpm test:vscode   # Cursor 3.24.9
```

Results on 2026-10-09:

| Branch | `pnpm check` | Browser | Real editor |
| --- | --- | --- | --- |
| markdown `continue-handover` @ de7c0cd | pass, 572/572 unit tests | 26/26 | `test:vscode` 2/2 |
| embedPDF `agent-handoff-native` @ 3141d6f | pass, 36/36 unit tests | 23/23 | VS Code 5/5, Cursor 3.24.9 5/5 |

## Visible comparison setup (display :7)

- **Display:** `:7` is 1920x1200, served by x11vnc on port 5907. Obsidian runs on the left half and VS Code on the right half.
- **Obsidian:** 1.14.4, extracted at `/workspace/tools/obsidian-1.14.4/obsidian`. Start it with `--no-sandbox --disable-gpu` and `XDG_CONFIG_HOME=/tmp/obsidian-config`. The AppImage is also in `/workspace/tools`.
- **VS Code:** 1.141 from `.vscode-test/` of the markdown repo. It runs with `--user-data-dir=/tmp/mdwb-vscode/user-data --extensions-dir=/tmp/mdwb-vscode/extensions --extensionDevelopmentPath=/workspace/repos/mdwb-compare /tmp/vscode-test-vault`.
  - After pulling: run `pnpm build` in `mdwb-compare`, then run **Developer: Reload Window**.
- **Test vaults:** `/tmp/obsidian-test-vault` and `/tmp/vscode-test-vault` hold the same notes (Callouts, Code, Footnotes, Tables, Videos, …). They live in `/tmp`, so you can recreate them from `test/fixtures/vault`.
- **Cursor:** 3.24.9, extracted at `/workspace/tools/cursor-3.24.9/squashfs-root/`.
- **Helpers:**
  - `/workspace/tools/drive.sh` (source it): xdotool helpers for driving both windows and taking paired screenshots into `/workspace/obsidian-compare`.
  - `/workspace/tools/shot.py`: takes screenshots.

## Agents: DeepSeek, Claude Code, Codex

- **Setup guide:** `/workspace/agent-integration/deepseek-setup.md`. It covers Claude Code and Codex in VS Code on DeepSeek, with models `deepseek-flash` (images) and `deepseek-v4-pro` (text only).
- **API key:** supplied **only through environment variables** (`DEEPSEEK_API_KEY`, and `ANTHROPIC_AUTH_TOKEN` for Claude Code). Never put it in a file in a repo, and never print it.

## Known open issues

- Links may open twice inside callouts and tables. This is **unverified**.
- An `@Note#a-b` link (line range) opens the note but does not jump to the lines.
- Line numbers bunch up beside tall tables and other tall rendered blocks.
- Fold arrows are visible on all lines, not only on hover or foldable lines.
- In Cursor, a second click on the Markdown button (the 10-second "keep text editor" rule) is unverified by hand.
- Bilibili `?p=` part titles are not shown; the card shows the video title.
- The active agent cannot be detected by an extension, so `auto` falls back to copying whenever more than one agent is installed. This is by design.
- PDF draft PR #2: the MCP bridge is a prototype. It is on by default and has no end-to-end tests. The Claude Code, Codex and Cursor commands it uses are undocumented. See the PR's risks section.

## Backlog (priority order)

1. Merge the PDF viewer into the workbench as an editor plugin, following `docs/plans/plugins-architecture.md`. Its name is still undecided.
2. OKF plugin family, following `docs/plans/okf-plugins.md`.
3. Markdown lint plugin (`okf-plugins.md` §6.1).
4. Git diff plugin (`okf-plugins.md` §6.2).
5. PDF toolbar redesign, with VS Code chrome as the default. See branch `toolbar-research-prototype` and `/workspace/embedpdf-toolbar-mockups`.
6. Cloud demo for the GitHub showcase.
7. Marp compatibility (`plugins-architecture.md` §4).

## Plans and artifacts

- **Plans in this repo:** `docs/plans/`
  - `plugins-architecture.md` with `plugin-graph.png` / `.dot`
  - `okf-plugins.md` with `okf-plugin-graph.png` / `.dot`
  - `obsidian-settings-audit.md`
- **Plan originals on the box:** `/workspace/plans/`
- **Screenshots on the box:**

  | Folder | Contents |
  | --- | --- |
  | `/workspace/obsidian-compare` | Obsidian vs workbench pairs |
  | `/workspace/mdwb-shots` | workbench |
  | `/workspace/embedpdf-shots` | PDF viewer |
  | `/workspace/embedpdf-toolbar-mockups` | toolbar mockups |
  | `/workspace/agent-integration-shots` | agent integration |
  | `/workspace/cursor-test-shots` | Cursor tests |
