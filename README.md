# Workshop: Markdown and PDF

A VS Code and Cursor extension for working with notes, papers and agents:

- **Markdown Workshop** edits Markdown the way Obsidian's Live Preview does:
  rendering in place, revealing syntax around the caret, wikilinks, embeds,
  properties, tables, callouts, math, Mermaid and Vim.
  See [packages/markdown/README.md](packages/markdown/README.md).
- **PDF Workshop** is an EmbedPDF-based PDF viewer that copies selections
  with exact page-and-box locations for agents.
  See [packages/pdf/README.md](packages/pdf/README.md).

Both hand selections to agents (Copy Link for Agent, IDE context for Claude
Code and Codex, Cursor Chat and Edit).

## Repository

| Path | What it is |
| --- | --- |
| `src/extension.ts` | The composition root: one plugin tree for both products |
| `packages/core` | The plugin core, on [Cordis](https://github.com/cordiverse/cordis) |
| `packages/agents` | What both products hand to agents: handoff text, IDE context |
| `packages/markdown` | Markdown Workshop |
| `packages/pdf` | PDF Workshop |
| `scripts/` | Build, `package.json` contributions, third-party notices, tests |
| `test/vscode` | End-to-end tests in a real, isolated VS Code (or Cursor) |

## Development

```sh
pnpm install
pnpm build          # dist/: extension.js, markdown/, pdf/
pnpm check          # format, lint, types, unit tests, contributions
pnpm test:browser   # each product's Chromium suite
pnpm test:vscode    # real VS Code; VSCODE_EXECUTABLE=… to test Cursor
pnpm package        # the .vsix
```
