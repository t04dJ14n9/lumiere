# Agent PDF Viewer (EmbedPDF)

A PDF viewer for VS Code and Cursor, built on [EmbedPDF](https://www.embedpdf.com/)
and its PDFium engine. Select text or drag a box over a figure, press
**Ask Agent**, and type your question: the agent chat opens with the exact
page and box, the file's hash, the selected text, and for a box a snapshot
of it. **Copy for Agent** copies the same for any other agent.

## Features

- **Viewer.** Continuous scrolling, page and zoom controls, fit width and fit
  page, Ctrl/⌘+wheel and pinch zoom, find in PDF (⌘F / Ctrl+F), internal links and web links.
  When the file changes on disk (a rebuilt paper), the viewer reloads at the
  same page and zoom.
- **PDF Outline in the Explorer.** The PDF's bookmarks appear as a native
  tree view; click an entry to open its page.
- **Ask Agent and Copy for Agent.** Select text, or drag over empty page
  space to select a region (a figure, table or equation), then use the
  buttons next to the selection, the right-click menu, the editor title
  buttons, or **PDF: Ask Agent** / **PDF: Copy for Agent**. ⌘C / Ctrl+C
  copies just the text.

  **Ask Agent** copies the selection and, when it knows which agent you use,
  opens that agent's chat with it typed in, ready for your question:
  - in Cursor, a new agent chat, with a region's snapshot attached;
  - in VS Code, the chat view when a chat extension such as Copilot Chat is
    installed (and `chat.disableAIFeatures` is off), with the snapshot attached.

  Extensions cannot see which agent chat is focused, so this happens only when
  the editor's chat is the only agent installed. With Claude Code or Codex
  installed as well, Ask Agent does not guess: it copies the selection (with
  the region snapshot's path) and asks you to paste it into your agent.

  The `vscodeEmbedPdf.askAgent.target` setting sends it to one agent instead:
  `claudeCode` (a new Claude Code conversation with the selection typed in),
  `codex` (the selection and snapshot attached to the Codex thread), `cursor`,
  `chat`, or `clipboard`.

  In Cursor, the editor title bar keeps only a few buttons, so **Ask Agent**
  and **Copy for Agent** sit in the **…** (More Actions) menu while something
  is selected. To pin them to the title bar, open that menu, choose
  **Configure Icon Visibility** and tick them.
- **Open Location.** **PDF: Open Location…** takes a link an agent printed and
  opens that page with the box highlighted.

## What an agent receives

```text
Source: [papers/attention.pdf (page 3)](<papers/attention.pdf#page=3&viewrect=72,83,134,21>)
PDF source SHA-256: `9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08`

Selected text:
Scaled dot-product attention

When you answer, cite the Source link above so the reader can reopen this spot in the PDF.
```

The last line is there because agents rarely cite the link unprompted; with
it they do, and **PDF: Open Location** opens what they cite.

For a region, the lines after the hash ask the agent to read or render the area inside
the box, give the path of a PNG snapshot of it, and list the text inside it
line by line (so a table reads row by row):

```text
Selected PDF region. Read the text inside the view rectangle, or render that area of the page to inspect figures and tables.
Region image: `/…/workspaceStorage/…/regions/attention-p9-3f2a….png`

Text in the region, line by line (table columns are not kept; see the image):
Table 3: Variations on the Transformer architecture. …
base 6 512 2048 8 64 64 0.1 0.1 100K 4.92 25.8 65
…
big 6 1024 4096 16 0.3 300K 4.33 26.4 213
```

Snapshots are saved in a `regions` folder in the extension's storage for the
workspace (`workspaceStorage/<id>/t04dj14n9.vscode-embedpdf/regions`), not in
the workspace itself (global storage when no folder is open). Together they
use at most `vscodeEmbedPdf.regionImageCache.maxSizeMB` megabytes (default 100,
at least 1; a change applies from the next snapshot): past that, the least
recently used are deleted, never the one just saved. Copying or asking about a
region again counts as a use. A selection across pages lists one link per
page.

The location uses the `page` and `viewrect` parameters of
[RFC 8118](https://www.rfc-editor.org/rfc/rfc8118): `viewrect=left,top,width,height`
in PDF points (1/72 inch), measured from the page's top-left corner. Paths are
relative to the workspace folder, or absolute for files outside it.

## Opening a location from another extension

```ts
await vscode.commands.executeCommand(
  'vscodeEmbedPdf.openLocation',
  vscode.Uri.file('/path/to/paper.pdf'),
  { page: 3, viewRect: { left: 72, top: 83, width: 134, height: 21 } },
);
```

The command also accepts a link string such as
`papers/paper.pdf#page=3&viewrect=72,83,134,21`.

## With LLM Wiki installed

LLM Wiki for VS Code ships its own PDF viewer for now. Both register as the
default editor for `*.pdf`, so VS Code asks which one to use; pick one with
**Reopen Editor With…** or the `workbench.editorAssociations` setting.

## How it is built

```text
src/
├── shared/      used on both sides; no DOM, no VS Code, no Node
│   ├── messages.ts       every message between extension and viewer, validated
│   ├── selection.ts      text and region selections
│   ├── pdf-location.ts   page + viewrect links (RFC 8118)
│   ├── agent-text.ts     the text Copy for Agent copies
│   ├── agent-target.ts   which agent chat Ask Agent opens
│   ├── region-text.ts    the text inside a region, line by line
│   ├── zoom-steps.ts     the zoom levels the buttons and wheel step through
│   └── geometry.ts       page rectangles
├── extension/   the VS Code side
│   ├── extension.ts            activation
│   ├── pdf-editor-provider.ts  opens *.pdf files
│   ├── pdf-panel.ts            one open editor: loads the file, reloads on change
│   ├── pdf-panels.ts           all open editors and the active one
│   ├── region-images.ts        region snapshots saved for agents
│   ├── outline-view.ts         the PDF Outline tree
│   ├── commands.ts             Copy for Agent, Ask Agent, Open Location
│   ├── agent-chat.ts           opening the agent chat with a selection
│   └── webview-html.ts         the viewer page and its content security policy
└── webview/     the viewer (React + EmbedPDF), one module per concern
    ├── main.tsx, host.ts       entry and messages to the extension
    ├── engine.tsx, plugins.ts  PDFium in a worker (main-thread fallback)
    ├── viewer.tsx              toolbar, search, pages
    ├── page.tsx, page-links.tsx
    ├── navigation.ts           pages, locations, highlights
    ├── reading-position.ts     the place and zoom kept across reloads
    ├── wheel-zoom.ts           Ctrl/⌘+wheel zoom, one step per notch
    ├── selection.ts            reporting text and region selections
    ├── region-details.ts       a region's text and PNG snapshot
    ├── drag-release.ts         ending drags released outside the viewer
    ├── secondary-buttons.ts    right-clicks left to the context menu
    └── styles/                 CSS using VS Code theme colours
```

The viewer renders untrusted PDF content, so the extension accepts only
well-formed messages from it (`shared/messages.ts`), opens only web and mail
links, and loads scripts only from the extension. The viewer never makes
network requests.

## Development

```sh
pnpm install
pnpm build            # dist/extension.js and dist/webview/
pnpm check            # lint, typecheck, unit tests
pnpm test:browser     # the viewer in Chromium, with a stand-in for VS Code
pnpm test:vscode      # the packaged extension in a real VS Code window
pnpm package          # production build and .vsix
```

`test:vscode` downloads VS Code into `.vscode-test/`, installs the extension
into a throwaway profile and home folder under `/tmp`, and drives the window
with Playwright. It never touches your own VS Code settings or extensions. Set
`VSCODE_EXECUTABLE` to test another build, or Cursor (its `cursor` executable,
for example `…/usr/share/cursor/cursor` in an extracted AppImage). On Linux
without a display, run it under `xvfb-run -a`.

Test PDFs are generated by `test/fixtures/make-fixtures.mjs`, so every
coordinate in the tests is known.

## License

MIT. Third-party licenses (EmbedPDF, PDFium, React) are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
