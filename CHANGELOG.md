# Changelog

## Unreleased

- Removed Copy for Agent (command, title button, context and selection menu
  items) and renamed Ask Agent to **Copy Link for Agent**
  (`vscodeEmbedPdf.copyLinkForAgent`, setting
  `vscodeEmbedPdf.copyLinkForAgent.target`; no migration). It copies the
  same text, and ⌘C / Ctrl+C or Copy text copies plain text.

## 0.1.0

First version, moved out of LLM Wiki for VS Code and rewritten:

- PDF viewer on EmbedPDF: continuous scrolling, page and zoom controls, find,
  internal and web links.
- PDF Outline view in the Explorer.
- Copy for Agent for text and region selections, with RFC 8118 page and
  viewrect links and the file's SHA-256.
- PDF: Open Location… for links such as `paper.pdf#page=3&viewrect=…`.
- The viewer reloads when the file changes on disk.
