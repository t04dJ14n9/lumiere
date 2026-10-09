# Changelog

## Unreleased

- The viewer's controls move into VS Code's own UI by default: editor title
  buttons and the page and zoom in the status bar (Go to Page, a zoom
  picker). `vscodeEmbedPdf.toolbar.mode` picks a slim bar in the viewer, a
  floating bar dockable to any edge, or none.
- A command and a keyboard shortcut for every action: page, go to page,
  zoom, fit width or page, find, the PDF Outline, and the selection tools.
- A Select Region tool, for regions over text.
- In Cursor, page, zoom and find buttons in the status bar.
- Removed Copy for Agent (command, title button, context and selection menu
  items) and renamed Ask Agent to **Copy Link for Agent**
  (`vscodeEmbedPdf.copyLinkForAgent`, setting
  `vscodeEmbedPdf.copyLinkForAgent.target`; no migration). It copies the
  same text, and ⌘C / Ctrl+C or Copy text copies plain text.
- Copy Link for Agent does not guess the agent: `auto` opens a chat only when
  the editor's own chat is the only agent installed, otherwise it copies and
  asks you to paste. `vscodeEmbedPdf.copyLinkForAgent.target` picks `cursor`,
  `chat`, `claudeCode` (a new conversation with the selection typed in),
  `codex` (selection and snapshot attached) or `clipboard`.
- Experimental agent bridge, **off by default**
  (`vscodeEmbedPdf.agentBridge.enabled`): a local MCP server (127.0.0.1,
  random port, bearer token) that serves the current PDF selection to VS Code
  chat, Cursor, Claude Code and Codex; **PDF: Copy MCP Setup for Claude Code /
  Codex…** connects the last two.

## 0.1.0

First version, moved out of LLM Wiki for VS Code and rewritten:

- PDF viewer on EmbedPDF: continuous scrolling, page and zoom controls, find,
  internal and web links.
- PDF Outline view in the Explorer.
- Copy for Agent for text and region selections, with RFC 8118 page and
  viewrect links and the file's SHA-256.
- PDF: Open Location… for links such as `paper.pdf#page=3&viewrect=…`.
- The viewer reloads when the file changes on disk.
