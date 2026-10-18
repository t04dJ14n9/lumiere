# Changelog

## Unreleased

- **Copy Link for Agent** paste is now a short Markdown link
  (`[file.pdf · p.N](path#page=N&viewrect=…)`) plus a blockquote of the
  selected text. The action lives in the PDF right-click context menu (and
  the command palette); the floating selection button and editor title
  action are gone. SHA-256, `Source:` wrappers and cite instructions are no
  longer written to the clipboard.
- The text selection no longer shows darker stripes where selected lines
  overlap (tightly set lines, or a line with a larger word).
- The extension was renamed from Agent PDF Viewer (EmbedPDF) to PDF Workshop (package `vscode-pdf-workshop`).
- `vscodeEmbedPdf.bridge.envelope` returns a Workbench v1 selection envelope
  (`producer: "pdf"`) matching Markdown Workshop's `BridgeEnvelope`
  (`capturedAt`, `source.identity` / `kind` / `media`, `locator`, `view`,
  `selection`, `revision`). Workshop may call this command; this command does
  not call Workshop back. See `docs/bridge-envelope.md`.
- Memory-only, per-pane PDF location history: Back to Previous Location / Forward
  to Next Location restore page coordinates, zoom and view mode after deliberate
  jumps. Separate from page stepping and native file navigation; no keybindings changed.
- New navigation and reader input cancel delayed restoration. Queued host
  messages are tied to the current viewer load, and zero-offset destinations are preserved.
- Open Location validates PDF files, asks about ambiguous workspace paths, and
  rejects invalid page destinations. Cancelled or superseded queued requests are
  skipped. An already dispatched native editor open may finish, then the newest
  valid request opens last; stale requests never apply a page destination.
- PDFs render in Restricted Mode. Workspace values for `pdfWorkshop.agentBridge.enabled`
  and `pdfWorkshop.copyLinkForAgent.target` are ignored until the folder is trusted.
- Open Location safely handles malformed percent escapes and drops invalid or non-finite
  page rectangles supplied by links or other extensions.
- Turning pages no longer shows blank pages. Like macOS Preview, the viewer renders the pages around the one being read
  as cheap low-resolution bitmaps (half size, one page at a time once the pages on screen are drawn), so a turn shows a
  picture at once; the full-resolution bitmap at the current zoom is swapped in when it has been decoded, with the low
  one visible until then. A render nobody wants any more (the next turn, a zoom step) is cancelled. Memory is bounded:
  four pages either side, one low bitmap per page, and six full bitmaps of pages not on screen. The picture cache is
  `src/shared/bitmap-cache.ts`, wired in `src/webview/page-bitmaps.tsx`.
- Settings from the Command Palette: `PDF: Open Settings`, `PDF: Change Setting…` (every contributed setting, edited by
  type, generated from package.json), toggles for smooth scrolling and keyboard shortcuts, default zoom / layout /
  scrolling pickers, and `Settings…` in the View picker. Same keys as the Settings editor, workspace if set there
  else user. Docs: docs/settings.md.

- Zen mode: `PDF: Enter Zen Mode` / `Exit Zen Mode` (`Ctrl+Alt+Z`, `Ctrl+Cmd+Z` on macOS; `Escape Escape` exits)
  runs VS Code's Zen Mode; the chrome and slim toolbars become a floating bar with an Exit zen button while it
  lasts (never written to settings). Specs `zen.spec.ts` (browser and VS Code), docs/zen.md.

- Zoom from the buttons, keys and menu keeps the centre of the viewer in place
  like Preview, also when the page grows wider than the viewer (the scroll the
  zoom asked for was lost to a page not yet laid out, and in page-by-page mode
  clamped away); spec `zoom-anchor.spec.ts`.

- ⌥←/↑/→/↓ (macOS) and Ctrl+Alt+←/↑/→/↓ (Windows, Linux) turn the page keeping the
  zoom and the place in the page, as Preview does; commands
  `PDF: Previous/Next Page, Keeping Place`. Scoped and opt-out like the other
  shortcuts (`pdfWorkshop.keyboardShortcuts`).

- Fix: pages stored with a `/Rotate` entry (slides saved sideways, scans) were
  drawn sideways and in a box of the wrong shape: EmbedPDF opens documents with
  rotation normalised and leaves the turn to the viewer, which never made it.
  Such pages are now turned to the way the PDF says, with search hits, links
  and the text selection on the page; spec `page-rotation.spec.ts`.

- New plugin `pdfLookUp` (macOS only, `pdfWorkshop.lookUp.enabled`): Look Up in
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
  `pdfWorkshop.regionImageCache.maxSizeMB` is not saved (the handoff goes
  without the image and says why) instead of exceeding the cap.
- The viewer batches its state reports (outline, selection, page and zoom)
  into versioned patches, about one per frame; each reload disposes the
  previous PDF's engine and workers.
- `get_current_note_selection` returns the same text as Markdown
  Workbench's Copy Link for Agent (`@path#lines` and the quoted lines); the
  shared format is in `docs/agent-handoff-format.md`.

- The viewer's controls move into VS Code's own UI by default: editor title
  buttons and the page and zoom in the status bar (Go to Page, a zoom
  picker). `pdfWorkshop.toolbar.mode` picks a slim bar in the viewer, a
  floating bar dockable to any edge, or none.
- A command and a keyboard shortcut for every action: page, go to page,
  zoom, fit width or page, find, the PDF Outline, and the selection tools.
- A Select Region tool, for regions over text.
- In Cursor, page, zoom and find buttons in the status bar.
- Removed Copy for Agent (command, title button, context and selection menu
  items) and renamed Ask Agent to **Copy Link for Agent**
  (`pdfWorkshop.copyLinkForAgent`, setting
  `pdfWorkshop.copyLinkForAgent.target`; no migration). It copies the
  same text, and ⌘C / Ctrl+C copies the selected text as plain text (the Copy text button is removed).
- Copy Link for Agent does not guess the agent: `auto` opens a chat only when
  the editor's own chat is the only agent installed, otherwise it copies and
  asks you to paste. `pdfWorkshop.copyLinkForAgent.target` picks `cursor`,
  `chat`, `claudeCode` (a new conversation with the selection typed in),
  `codex` (selection and snapshot attached) or `clipboard`.
- Experimental agent bridge, **off by default**
  (`pdfWorkshop.agentBridge.enabled`): a local MCP server (127.0.0.1,
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
