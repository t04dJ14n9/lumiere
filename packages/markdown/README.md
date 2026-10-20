# Lumière

[![CI](https://github.com/t04dJ14n9/vscode-markdown-workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/t04dJ14n9/vscode-markdown-workbench/actions/workflows/ci.yml)

Obsidian's editing experience for Markdown in VS Code and Cursor: Live
Preview that reveals syntax at the caret, wikilinks resolved the way
Obsidian resolves them, embeds, callouts, properties, tables, math,
diagrams, footnotes, tasks and tags, with VS Code keeping the text, saving
and undo.

Every feature is a plugin you can switch off, and other extensions can add
their own through a versioned API.

## Install

Lumière ships in the **Lumière: Markdown Editor and PDF Reader** extension
([`t04dJ14n9.lumiere`](https://marketplace.visualstudio.com/items?itemName=t04dJ14n9.lumiere)
on the VS Code Marketplace). Search for **Lumière** in the Extensions view, or
install that listing. To build a VSIX yourself, from the repository root:

```sh
pnpm install
pnpm package
code --install-extension lumiere-0.1.1.vsix
```

To try it without touching your own setup, install it into a throwaway
profile as described in [docs/MANUAL_TEST_PLAN.md](docs/MANUAL_TEST_PLAN.md#build-and-install-into-an-isolated-profile).

## Use

- Open a note with **Open With… › Lumière**, or run **Markdown
  Workshop: Use Lumière for Markdown in This Workspace** to make
  it the editor for `*.md` in the workspace.
- A folder containing `.obsidian/` is a vault: links, tags, backlinks and
  search work within it. Without one, each workspace folder is a vault.
- **Toggle Live Preview/Source Mode** switches modes; **Open as Text** opens
  VS Code's text editor on the same document.
- **Go to Heading…** (Ctrl+Shift+O; Command+Shift+O on macOS) searches the
  active Workshop note's headings. **Toggle Markdown Outline** (Ctrl+Alt+O;
  Control+Command+O on macOS) shows or hides its heading tree, including after
  moving the view to another sidebar or the panel. VS Code's native Outline
  and breadcrumbs remain available in the plain text editor.
- **Manage Plugins** opens the plugin switches
  (`lumiere.markdown.plugins.<id>.enabled`); **Show Plugin Status** lists
  every plugin and why one failed or is waiting.
- **Copy Link for Agent** (right-click a selection) copies the passage
  and its `@Note.md#a-b` line link for your agent. It opens a chat only
  when the editor's own chat is the only agent, or when
  `lumiere.markdown.copyLinkForAgent.target` picks one. Plain Ctrl/Cmd+C
  copies text.
- **Copy Wiki Reference for Agent** copies that same wording for a wiki
  note and does not open a chat. **Copy Bridge Envelope** copies the
  versioned JSON selection (`docs/bridge-envelope.md`). Agent PDF Viewer
  is optional.
- **Import Asset** copies a file into the project's assets folder (created
  then) and inserts a portable Markdown link. **New Scratch Note** writes
  a temporary note outside the wiki; **Promote Scratch Note** files it
  only when you ask. **Open Marp Preview to the Side** and **Export Marp
  Slide Deck** hand a `marp: true` deck to VS Code and Marp. A deck inside
  the wiki bundle is not wrapped into a page.
- **Open Copied Agent Reference** opens `@Note.md#30-32` in Markdown
  Workshop and selects those source lines. It prefills the reference from
  the clipboard for you to confirm or replace; surrounding quotes are fine.
  Relative paths stay inside workspace folders, with a choice if more than
  one folder matches. Full note URIs also work, including remote files.
  This explicit command is the fallback when clicking an agent's link opens
  the note without its line range; it does not intercept native chat clicks.
- `lumiere.markdown.editor.fontSize` (8 to 48, default 16, Obsidian's body
  size) sets the note text size, replacing `editor.fontSize` for notes;
  headings, tables, code, properties, footnotes and line numbers scale with
  it, live. `lumiere.markdown.editor.lineHeight` (1 to 3, default 1.5,
  Obsidian's) is the line height as a multiple of that size, so lines scale
  with it too. The font family, weight, letter spacing and ligatures still
  follow `editor.*` for Markdown files; `editor.lineHeight` no longer applies.
- `lumiere.markdown.editor.dragScrollSpeed` makes mouse text-selection
  auto-scroll faster near the note's edges. It is a multiplier from 1 to 10
  (default 4); 1 restores CodeMirror's original speed. Changes apply live in
  Live Preview and Source mode. Table-cell selection and row/property
  reordering keep their existing edge-scroll behavior.
- **Lumière: Open Settings** opens the Settings UI filtered to this
  extension. **Change Setting…** lists every setting of the extension (by
  plugin, with its value) and edits the one you pick by its type. **Set Note Font Size**, **Toggle Line Numbers**, **Toggle
  Readable Line Width**, **Toggle Mermaid Diagrams**, **Toggle Inline Title**
  and **Toggle Vim Mode** change the same `lumiere.markdown.*` settings the
  Settings UI shows, in the workspace settings when the workspace sets them
  and in the user settings otherwise. They keep no state of their own, so
  edits in the Settings UI or `settings.json` and the commands always agree.
- `lumiere.markdown.preset: "minimal"` loads only the core editor.
- `lumiere.markdown.debug.logging` writes debug lines to the **Markdown
  Workshop** output channel.

### In Cursor

Cursor opens `*.md` in its own **Markdown Editor**, with a **Preview |
Markdown** switch in the editor's top-right corner. **Use Lumière
for Markdown in This Workspace** writes a workspace editor association, which
takes precedence over Cursor's editor for notes opened afterwards; reopen
tabs that were already open.

Cursor's **Markdown** button opens the note in the plain text editor and
remembers that per file. `lumiere.markdown.editor.reclaimTextEditor`
(`auto`, on only in Cursor) reopens such a note in Lumière and
closes the text tab, for notes the workspace association routes here.
It leaves diffs, Git views, untitled files and anything opened with **Open
as Text** alone. Asking for the text editor a second time within 10 seconds
keeps it (the tab hold also arms the Open-as-Text bypass so selection
reclaim cannot steal that tab), which is how **Reopen Editor With… › Text
Editor** still works.
Set it to `off` to keep Cursor's behaviour, or `on` to use it in VS Code too.

Markdown diffs from Source Control stay VS Code's text diff unless
`lumiere.markdown.gitDiffEditor.diffEditor` is `rendered`; then they open as
both versions rendered side by side. **Open Rendered Git Diff** opens one
against HEAD for the active note either way.

The native suite runs against Cursor with
`VSCODE_EXECUTABLE=<cursor install>/cursor pnpm test:vscode`.

[CAPABILITIES.md](CAPABILITIES.md) lists every plugin, its default and how
it differs from Obsidian. The extension's commands are under **Markdown
Workshop** in the command palette.

## Extend

Other extensions add plugins (markers, actions, link handlers, code block
renderers) through API v1: see [API.md](API.md) and the sample plugin in
[test/fixtures/sample-plugin](test/fixtures/sample-plugin/).

## Develop

```sh
pnpm install
pnpm check          # format, lint, types, unit tests, generated contributions
pnpm test:browser   # webview smoke tests in Chromium
pnpm test:vscode    # native suite in an isolated VS Code profile (local only, not in CI)
pnpm check:full     # check, test:browser and test:vscode: run before every push
pnpm package        # VSIX; checks THIRD_PARTY_NOTICES.md is current
```

**Before every push run the full local check, `pnpm check:full`** (on headless
Linux: `xvfb-run -a pnpm check:full`). It runs `pnpm check`, `pnpm test:browser`
and `pnpm test:vscode`. GitHub Actions does not run the real-VS Code specs
(`test/vscode`): they were flaky under load, so they are a required local
pre-push check instead.

Read [AGENTS.md](AGENTS.md) before changing code. [DESIGN.md](DESIGN.md)
describes the architecture, [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
records each phase, and [docs/MANUAL_TEST_PLAN.md](docs/MANUAL_TEST_PLAN.md)
is the owner's acceptance plan. Obsidian is a behaviour reference only; no
Obsidian code, CSS or assets are used.

## CI and quality gates

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull
request and on pushes to `main`. Each job, and how to run it locally:

| Job | What it proves | Locally |
| --- | --- | --- |
| `check` | Prettier, lint (with the code-norm limits), typecheck, unit tests and generated contributions pass | `pnpm check` |
| `browser` | The webview suite in Chromium; on failure, `test-results/` is uploaded | `pnpm test:browser` |
| `package` | `pnpm package` builds the VSIX, leaves committed files unchanged, and the VSIX is under 10 MB with no tests, sources, source maps or secret-shaped strings; the VSIX is uploaded as the `vsix` artifact | `pnpm package && bash .github/scripts/check-vsix.sh *.vsix 10` |
| `secret-scan` | gitleaks finds no secrets in the git history | `gitleaks git --redact .` |
| `audit (advisory)` | `pnpm audit --prod`; a warning, never a failure | `pnpm audit --prod` |

The real-VS Code specs (`pnpm test:vscode`) are not a CI job: run them locally
before every push (see Develop). Cursor cannot run in CI either, so test it by
hand with
`VSCODE_EXECUTABLE=<cursor executable> xvfb-run -a pnpm test:vscode`. CI never
uses API keys or other secrets. Dependabot proposes grouped npm and
GitHub Actions updates weekly.

Pushing a tag `v<version>` that matches `package.json` runs
[`release.yml`](.github/workflows/release.yml): `pnpm check`, `pnpm package`,
and a GitHub Release with the VSIX attached. Publishing stays manual: with a
Marketplace PAT run `pnpm exec vsce publish --packagePath <file>.vsix`, and
for Open VSX `pnpm dlx ovsx publish <file>.vsix -p <token>`. Do not store
these tokens in the repository.

## License

MIT. Bundled packages and their licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### Precise jumps within a note

Use **Lumière: Go Back in Note** / **Go Forward in Note**, also
available as note-title arrows, to revisit deliberate link, heading, footnote,
explicit find-match and API/reference jumps. The 100-entry history belongs to
one note pane, stays in extension-host memory across webview recreation, and is
cleared when that pane closes or the host restarts. Split panes are independent.
Ordinary scrolling and typing do not add entries. VS Code handles cross-file
Back/Forward; Vim's Ctrl+O/Ctrl+I remain its own jumplist.
