# Changelog

## 0.1.0 (unreleased)

- Selecting a `|W` wikilink image no longer draws a long caret/selection bar
  below the card: the block paint reserve is released after measure, and the
  caret is hidden while the image is selected (Host GUI BH-007).

- Inline math on a list item's first line renders in Live Preview; it was
  blank, or drawn over the text before it.
- Math that needs MathJax's on-demand glyphs renders offline: `\mathbb`,
  `\mathfrak`, `\mathscr`, `\mathsf`, `\mathtt`, `\ell`, `\Re`, `\perp`,
  `\leadsto`, `\checkmark` and many AMS symbols failed with "dynamic file …
  failed to load", and `\mathcal` and accented letters in `\text` were drawn in
  the wrong font.

- **Keep Marp Deck in Workshop** now uses the command ID
  `markdownWorkshop.marp.keepInWorkshop`. Product copy uses Workshop throughout.

- The heading tree is now **Markdown Outline**, with **Toggle Markdown Outline**
  in the command palette. Existing command IDs, settings and shortcuts stay the same.

- cursorBridge: in Cursor, Cmd/Ctrl+L opens Chat and Cmd/Ctrl+K opens Edit on
  the Live Preview selection (native Cursor apply). A handoff lease suppresses
  reclaim for the whole native Edit session; selection offsets are
  version-checked after warm/open. Disabled bridge restores Insert Link.

- Renamed from Markdown Workbench. The package name is
  `vscode-markdown-workshop`; settings and commands use `markdownWorkshop.*`.
  There is no compatibility alias. The display name stays **Markdown Workshop**
  (Marketplace, custom editor, command category, settings UI title, and other
  user-visible strings).

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

- Opening a target in a note (a Markdown Outline click, a Backlinks entry, a
  same-note `#heading` link or a link from another note) scrolls it to the vertical centre of the editor, as VS Code's Outline and
  Obsidian's do, instead of to the nearest edge; near the start or end of a
  note it stays as close to the centre as the note's scroll range allows.

- Review fixes (round 1): the Copy Link for Agent plugin is now
  `agentBridge` (`markdownWorkshop.plugins.agentBridge.enabled`; the command
  and `markdownWorkshop.copyLinkForAgent.target` keep their names); plugin
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
  `markdownWorkshop.debug.logging` adds debug lines.
- Public API v1 for other extensions: editors, selections, vault queries,
  plugin catalog and states, and external plugins with markers, actions,
  link handlers and code block processors. See API.md.
