# Lumière: Markdown Editor and PDF Reader

Obsidian-style Live Preview for Markdown and a PDF reader, in VS Code and
Cursor, with links your AI agent can follow.

Lumière turns your editor into a place to write notes and read papers. Notes
render as you type, the way Obsidian's Live Preview does, and PDFs open in a
fast reader in the next tab. Every passage you select in either one can go
straight to your agent, with a link that points it back to the exact lines or
the exact box on the page.

## Features

### Markdown, the way Obsidian edits it

- **Live Preview.** Formatting renders in place and its syntax shows only
  around the caret. Switch to Source mode at any time; VS Code keeps the
  text, saving and undo.
- **Links that work like a vault.** Wikilinks with aliases, headings and
  blocks; embeds of notes, sections, images, video and PDFs; link
  suggestions as you type; backlinks, outgoing links and unlinked mentions;
  a graph; a quick switcher; and renames that update every link.
- **Rich blocks.** Tables you edit as a grid, callouts, math, Mermaid
  diagrams, code blocks, footnotes, tasks, highlights and comments.
- **Properties.** A typed editor for a note's front matter: text, lists,
  numbers, dates, checkboxes, tags and aliases.
- **Finding your way.** Search, an outline, tags, folding, sticky headings,
  hover previews and word count.
- **Git in the margin.** Change bars, inline diffs, the author of the line
  you are on, and side-by-side rendered diffs.
- **Vim mode**, more than one caret, smart lists and paired brackets.
- **Your vault as it is.** A folder with `.obsidian/` is treated as a vault,
  and links, tags and search resolve the way Obsidian resolves them.

### PDFs you can point an agent at

- **A reader built on [EmbedPDF](https://www.embedpdf.com/)** and the PDFium
  engine: single pages or two-page spreads, continuous or page-by-page
  scrolling, zoom and fit, find, and working internal and web links.
- **Controls in the editor's own UI.** Page, zoom and view sit in the status
  bar and the editor's title bar, and the PDF's bookmarks appear as an
  outline in the Explorer.
- **Select text or draw a box** over a figure, table or equation.
- **Reloads in place.** When a paper is rebuilt on disk, the reader comes
  back at the same page and zoom.

### Built for agents

- **Copy Link for Agent.** From a note it copies the passage with an
  `@note.md#12-18` link to its lines. From a PDF it copies the text with a
  link to the page and box, and a snapshot of a drawn region.
- **Straight into the chat.** When your editor's own chat is your agent,
  the selection opens there, ready for your question. Or pick Claude Code,
  Codex, Cursor or the clipboard as the target.
- **Cursor's Add to Chat and Quick Edit** (Cmd+L and Cmd+K) work from inside
  notes.
- **Open Copied Agent Reference** and the PDF's **Open Location…** take a
  link an agent printed and open those lines, or that page with the box
  highlighted.

### Make it yours

Every feature is a plugin you can turn on or off in Settings, from tables
and callouts to Vim mode, the graph and the PDF tools. Other extensions can
add their own plugins (markers, actions, link handlers, code block renderers)
through a versioned API.

## Get started

1. Install [Lumière](https://marketplace.visualstudio.com/items?itemName=t04dJ14n9.lumiere)
   (`t04dJ14n9.lumiere`) from the VS Code Marketplace, or search for **Lumière**
   in the Extensions view.
2. Open a folder of notes. An existing Obsidian vault works as it is.
3. Run **Use Lumière for Markdown in This Workspace** from the Command Palette, so
   `*.md` files in that folder open in Lumière. It is an option rather than
   the default, so it does not take over every README you open.
4. Open a PDF. If another PDF extension opens it first, use **Open With… ›
   Lumière PDF**.

**Open Settings** shows all of Lumière's settings, grouped by plugin, and
**Change Setting…** edits any one of them from the Command Palette.

### In Cursor

Cursor has its own Markdown editor, with a **Preview | Markdown** switch in
the editor's corner. Once Lumière is the workspace's Markdown editor, notes
that Cursor opens in its text editor come back to Lumière, while diffs, Git
views and anything you open with **Open as Text** stay as they are. Cursor
keeps most extension buttons in the editor's **…** menu, so the PDF reader's
page and zoom controls live in the status bar.

### In DeepSeek Harness

Lumière's Markdown editor also runs in
[DeepSeek Harness](https://www.deepseek.com/en/harness/) (0.2.1 or later), as
a DSH plugin: a workspace's notes open in Lumière in DSH's preview sidebar,
with the same Live Preview, links, properties and math, and save as you type.
Build it with `pnpm --filter @workshop/dsh build`, then add
`packages/dsh/dist/bundle` to a DSH profile:
`dsh plugin --profile web add link:<path to dist/bundle>`. PDFs, Git
features and the side views are VS Code and Cursor only for now; see
[packages/dsh](packages/dsh/README.md).

## Develop

```sh
pnpm install
pnpm build          # dist/: extension.js, markdown/, pdf/
pnpm check          # format, lint, types, unit tests, contributions
pnpm test:browser   # each product's Chromium suite
pnpm test:vscode    # real VS Code; VSCODE_EXECUTABLE=… to test Cursor
pnpm package        # the .vsix
```

| Path | What it is |
| --- | --- |
| `src/extension.ts` | The composition root: one plugin tree for both parts |
| `packages/core` | The plugin core, on [Cordis](https://github.com/cordiverse/cordis) |
| `packages/agents` | What both parts hand to agents: handoff text, IDE context |
| `packages/markdown` | The Markdown editor ([README](packages/markdown/README.md), [plugins](packages/markdown/CAPABILITIES.md)) |
| `packages/pdf` | The PDF reader ([README](packages/pdf/README.md)) |
| `packages/dsh` | The Markdown editor in DeepSeek Harness ([README](packages/dsh/README.md)) |
| `scripts/` | Build, `package.json` contributions, third-party notices, tests |
| `test/vscode` | End-to-end tests in a real, isolated VS Code (or Cursor) |

Each plugin declares the services it uses and provides, and plugins talk
through typed events, so any one can be switched off without breaking the
rest. To write a plugin of your own as a separate extension, start with
[packages/markdown/AGENT.md](packages/markdown/AGENT.md) and
[packages/markdown/API.md](packages/markdown/API.md). Contributors and coding
agents: read [AGENTS.md](AGENTS.md) first.

## License

MIT. Bundled libraries and their licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Lumière is not affiliated with or endorsed by Obsidian.
