# Changelog

## 0.1.0 (unreleased)

- Display name is **Markdown Workshop** (Marketplace, custom editor,
  command category, settings UI title, and other user-visible strings).
  Extension id `vscode-markdown-workbench` and settings keys
  `markdownWorkbench.*` are unchanged so existing installs keep working.

- Tables: the open cell and rectangular selections draw an inset accent
  selection box again. Opening a cell used to clear `.table-cell-selected`, and
  CSS `outline` was clipped by `.table-scroll` overflow.

First packaged build, for the owner's acceptance testing. Not published.

- Wiki, assets, scratch and Marp plugins, plus a versioned bridge
  envelope (`docs/bridge-envelope.md`). Copy Wiki Reference for Agent and
  Copy Bridge Envelope do not start an agent. Import Asset writes into the
  configured assets folder only when you import. Scratch notes stay outside
  the bundle until Promote Scratch Note. Marp decks preview and export
  through VS Code and Marp for VS Code; a deck inside the wiki bundle is
  not wrapped into a page. Agent PDF Viewer stays a separate extension.

- Opening a target in a note (a Note Outline click, a Backlinks entry, a
  same-note `#heading` link or a link from another note) scrolls it to the vertical centre of the editor, as VS Code's Outline and
  Obsidian's do, instead of to the nearest edge; near the start or end of a
  note it stays as close to the centre as the note's scroll range allows.

- Review fixes (round 1): the Copy Link for Agent plugin is now
  `agentBridge` (`markdownWorkbench.plugins.agentBridge.enabled`; the command
  and `markdownWorkbench.copyLinkForAgent.target` keep their names); plugin
  start-up rolls back on failure and shutdown runs in reverse order; Live
  Preview redraws only the blocks an edit or caret move affects; selection
  state reaches the extension in batches. The handoff text format is shared
  with Agent PDF Viewer (`docs/agent-handoff-format.md`).

- Live Preview editor for Markdown, as a custom editor beside VS Code's
  text editor, sharing one document, save and undo.
- Plugins, each with a switch: properties, inline title, links, embeds,
  page preview, tables, callouts, math, diagrams, code blocks, footnotes,
  tasks, tags, suggestions, search query blocks, outline, backlinks,
  outgoing links, quick switcher, word count, link updates on rename,
  folding, line numbers, indentation guides, spellcheck, auto-pairing,
  smart lists, formatting commands, Vim, HTML paste and Copy Link for Agent
  about Selection.
- Vault index that resolves links like Obsidian, with a saved snapshot for
  instant start-up.
- Commands: **Manage Plugins**, **Show Plugin Status** and **Use Markdown
  Workshop for Markdown in This Workspace**.
- Logging to the **Markdown Workshop** output channel;
  `markdownWorkbench.debug.logging` adds debug lines.
- Public API v1 for other extensions: editors, selections, vault queries,
  plugin catalog and states, and external plugins with markers, actions,
  link handlers and code block processors. See API.md.
