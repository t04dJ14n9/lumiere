# Changelog

## Unreleased

- New plugin `pdfLookUp` (macOS only, `vscodeEmbedPdf.lookUp.enabled`): Look Up in
  the right-click menu, and a force click, open the word under the pointer in
  the Dictionary app. Native three-finger-tap Look Up is not possible on
  image-drawn pages; see docs/look-up.md.
- Smooth zoom: a trackpad pinch (Ctrl+wheel with small deltas) scales
  continuously about the pointer with a live preview and one crisp render when
  it settles; zoom buttons, keys and wheel notches animate from the first frame
  and carry on from the picture on screen when pressed again mid-animation.

- Review fixes (round 1), internal: the extension is a set of plugins
  (`pdf`, `pdfToolbar`, `pdfOutline`, `pdfRegions`, `pdfLookUp`, `agentBridge`) started by
  a runtime that rolls back a plugin that fails to start and stops plugins
  in reverse order; tests check every plugin leaves nothing registered when
  it stops.
- The agent bridge starts only when it is enabled **and** used (a PDF is
  open or Copy MCP Setup was run), and its MCP server is a separate bundle
  loaded only then; `dist/extension.js` shrank from 1.6 MB to under 70 KB.
  The extension now activates when a PDF opens. The stdio shim is now
  included in the VSIX (it was missing).
- Region snapshots have a hard size limit: a snapshot larger than
  `vscodeEmbedPdf.regionImageCache.maxSizeMB` is not saved (the handoff goes
  without the image and says why) instead of exceeding the cap.
- The viewer batches its state reports (outline, selection, page and zoom)
  into versioned patches, about one per frame; each reload disposes the
  previous PDF's engine and workers.
- `get_current_note_selection` returns the same text as Markdown
  Workbench's Copy Link for Agent (`@path#lines` and the quoted lines); the
  shared format is in `docs/agent-handoff-format.md`.

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
  same text, and ⌘C / Ctrl+C copies the selected text as plain text (the Copy text button is removed).
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
