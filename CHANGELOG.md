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

## 0.1.0

First version, moved out of LLM Wiki for VS Code and rewritten:

- PDF viewer on EmbedPDF: continuous scrolling, page and zoom controls, find,
  internal and web links.
- PDF Outline view in the Explorer.
- Copy for Agent for text and region selections, with RFC 8118 page and
  viewrect links and the file's SHA-256.
- PDF: Open Location… for links such as `paper.pdf#page=3&viewrect=…`.
- The viewer reloads when the file changes on disk.
