# Markdown Workbench

[![CI](https://github.com/t04dJ14n9/vscode-markdown-workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/t04dJ14n9/vscode-markdown-workbench/actions/workflows/ci.yml)

Obsidian's editing experience for Markdown in VS Code and Cursor: Live
Preview that reveals syntax at the caret, wikilinks resolved the way
Obsidian resolves them, embeds, callouts, properties, tables, math,
diagrams, footnotes, tasks and tags, with VS Code keeping the text, saving
and undo.

Every feature is a plugin you can switch off, and other extensions can add
their own through a versioned API.

## Install

The extension is not on the Marketplace. Build the VSIX and install it:

```sh
pnpm install
pnpm package
code --install-extension vscode-markdown-workbench-0.1.0.vsix
```

To try it without touching your own setup, install it into a throwaway
profile as described in [docs/MANUAL_TEST_PLAN.md](docs/MANUAL_TEST_PLAN.md#build-and-install-into-an-isolated-profile).

## Use

- Open a note with **Open With… › Markdown Workbench**, or run **Markdown
  Workbench: Use Markdown Workbench for Markdown in This Workspace** to make
  it the editor for `*.md` in the workspace.
- A folder containing `.obsidian/` is a vault: links, tags, backlinks and
  search work within it. Without one, each workspace folder is a vault.
- **Toggle Live Preview/Source Mode** switches modes; **Open as Text** opens
  VS Code's text editor on the same document.
- **Manage Plugins** opens the plugin switches
  (`markdownWorkbench.plugins.<id>.enabled`); **Show Plugin Status** lists
  every plugin and why one failed or is waiting.
- **Copy Link for Agent** (right-click a selection) copies the passage
  and its `@Note.md#a-b` line link for your agent. It opens a chat only
  when the editor's own chat is the only agent, or when
  `markdownWorkbench.copyLinkForAgent.target` picks one. Plain Ctrl/Cmd+C
  copies text.
- `markdownWorkbench.preset: "minimal"` loads only the core editor.
- `markdownWorkbench.debug.logging` writes debug lines to the **Markdown
  Workbench** output channel.

### In Cursor

Cursor opens `*.md` in its own **Markdown Editor**, with a **Preview |
Markdown** switch in the editor's top-right corner. **Use Markdown Workbench
for Markdown in This Workspace** writes a workspace editor association, which
takes precedence over Cursor's editor for notes opened afterwards; reopen
tabs that were already open.

Cursor's **Markdown** button opens the note in the plain text editor and
remembers that per file. `markdownWorkbench.editor.reclaimTextEditor`
(`auto`, on only in Cursor) reopens such a note in Markdown Workbench and
closes the text tab, for notes the workspace association routes here.
It leaves diffs, Git views, untitled files and anything opened with **Open
as Text** alone. Asking for the text editor a second time within 10 seconds
keeps it, which is how **Reopen Editor With… › Text Editor** still works.
Set it to `off` to keep Cursor's behaviour, or `on` to use it in VS Code too.

The native smoke test runs against Cursor with
`VSCODE_EXECUTABLE=<cursor install>/cursor pnpm test:vscode`.

[CAPABILITIES.md](CAPABILITIES.md) lists every plugin, its default and how
it differs from Obsidian. The extension's commands are under **Markdown
Workbench** in the command palette.

## Extend

Other extensions add plugins (markers, actions, link handlers, code block
renderers) through API v1: see [API.md](API.md) and the sample plugin in
[test/fixtures/sample-plugin](test/fixtures/sample-plugin/).

## Develop

```sh
pnpm install
pnpm check          # format, lint, types, unit tests, generated contributions
pnpm test:browser   # webview smoke tests in Chromium
pnpm test:vscode    # native smoke test in an isolated VS Code profile
pnpm package        # VSIX; checks THIRD_PARTY_NOTICES.md is current
```

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
| `vscode (VS Code stable)` | The packaged extension in the latest VS Code stable, under `xvfb-run` | `xvfb-run -a pnpm test:vscode` |
| `package` | `pnpm package` builds the VSIX, leaves committed files unchanged, and the VSIX is under 10 MB with no tests, sources, source maps or secret-shaped strings; the VSIX is uploaded as the `vsix` artifact | `pnpm package && bash .github/scripts/check-vsix.sh *.vsix 10` |
| `secret-scan` | gitleaks finds no secrets in the git history | `gitleaks git --redact .` |
| `audit (advisory)` | `pnpm audit --prod`; a warning, never a failure | `pnpm audit --prod` |

Cursor cannot run in CI, so test it by hand with
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
