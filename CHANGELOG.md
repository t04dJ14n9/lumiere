# Changelog

## 0.1.0 (unreleased)

First packaged build, for the owner's acceptance testing. Not published.

- Live Preview editor for Markdown, as a custom editor beside VS Code's
  text editor, sharing one document, save and undo.
- Plugins, each with a switch: properties, inline title, links, embeds,
  page preview, tables, callouts, math, diagrams, code blocks, footnotes,
  tasks, tags, suggestions, search query blocks, outline, backlinks,
  outgoing links, quick switcher, word count, link updates on rename,
  folding, line numbers, indentation guides, spellcheck, auto-pairing,
  smart lists, formatting commands, Vim, HTML paste and Copy for Agent.
- Vault index that resolves links like Obsidian, with a saved snapshot for
  instant start-up.
- Commands: **Manage Plugins**, **Show Plugin Status** and **Use Markdown
  Workbench for Markdown in This Workspace**.
- Logging to the **Markdown Workbench** output channel;
  `markdownWorkbench.debug.logging` adds debug lines.
- Public API v1 for other extensions: editors, selections, vault queries,
  plugin catalog and states, and external plugins with markers, actions,
  link handlers and code block processors. See API.md.
