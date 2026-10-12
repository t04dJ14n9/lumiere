# Capabilities

What Markdown Workbench does, plugin by plugin, and where it differs from
Obsidian. Each plugin's README (`src/plugins/<id>/README.md`) has the
details. "Default" is the `obsidian` preset; the `minimal` preset loads only
the core plugins. No row here is an Obsidian parity claim until the owner
records it in `docs/PARITY.md`.

## Core (always on)

| Plugin | What it does | Differences and limits |
| --- | --- | --- |
| document | One text shared by every panel and VS Code's text editor; VS Code owns save, EOL and undo | Typing groups for undo like Obsidian; history is VS Code's |
| editor | Per-pane precise-jump Back/Forward (100 locations, in memory), geometric restoration, and the CodeMirror editor in a webview, view state per panel, settings for mode, readable line length (700 px, off by default), strict line breaks, right-to-left, tabs; note text follows VS Code's `editor.font*`, `letterSpacing` and `lineHeight` for Markdown files | Panels of one note keep separate selections, scroll and folds. At the default `editor.lineHeight` (0) lines are as tall as in the built-in text editor (19px at 14px on Linux and Windows), not Obsidian's 1.5; headings keep Obsidian's sizes |
| dialect | Obsidian-flavoured Markdown: wikilinks, embeds, tags, highlights, comments, callouts, footnotes, math, block IDs | Grammar is fixed; plugins cannot change parsing |
| render | Sanitized HTML for rendered blocks | Scripts, forms, objects, embeds and `srcdoc` are removed; application links (`obsidian:`, `zotero:`) are kept and confirmed before opening |
| livePreview | Syntax hidden except where the selection is; rendered blocks crossed as one unit | No Reading view (DESIGN §25.8); comments stay visible, faint, as in Obsidian |
| commands | Obsidian editor command IDs, save/undo/redo/close, Open as Text | Commands act on the active panel |
| publicApi | Versioned extension API, plugin management, and **Open Copied Agent Reference** | Explicit `@path#lines`/full-URI navigation; native chat clicks and global cross-extension history are unchanged |
| vault | Index of every note: link resolution like Obsidian's, resolved and unresolved links, tags, aliases, headings, blocks | `.obsidian` marks a vault; without it the workspace folder is the vault. 50,000-file cap; hidden folders and `node_modules` skipped |
| resources | Contained file access for embeds and previews | Files outside the vault and escaping symlinks are refused |

## Features (on by default unless noted)

| Plugin | What it does | Differences and limits |
| --- | --- | --- |
| properties | The properties sheet: every type, chips, type menu, sort, drag, structured copy and paste | Type choices are stored per vault by this extension |
| inlineTitle | Off by default. The file name above the note; edit it to rename | Off so line 1 starts at the top, as in VS Code (Obsidian shows it by default). Only saved local files can be renamed |
| links | Click to follow, Mod-click in source, open to side, create missing notes, unresolved links dimmed | Markdown links and links inside embeds are not dimmed |
| embeds | Notes, sections, blocks, images (with an inspector), audio, video, PDF cards | PDFs open in their own editor rather than inline; remote media needs a trusted workspace |
| onlineVideos | YouTube (watch, youtu.be, Shorts) and Bilibili (BV, av, `?p=`) links written as images show as cards with a button that opens the browser; in trusted workspaces the title, author, length and cover (Bilibili via its public API, YouTube via oEmbed, looked up by the extension host) | Not in Obsidian. No player by default: YouTube refuses to play in VS Code webviews (error 153) and Bilibili's player does not buffer there (`onlineVideos.bilibiliPlayer` brings back **Play here**); nothing is fetched in an untrusted workspace |
| pagePreview | Mod-hover preview of notes, headings, blocks and attachments | External links are not previewed |
| tables | Spreadsheet-style table editing, selection, TSV clipboard, row and column commands and dragging | — |
| callouts | All callout types, nesting, folding with per-panel memory | Colours follow the VS Code theme |
| math | MathJax inline and block math | No user macros |
| diagrams | Mermaid | Theme follows VS Code light or dark; HTML labels off |
| codeBlocks | Prism highlighting and a Copy button | Languages without a loaded grammar stay plain |
| footnotes | References as superscript numbers in LaTeX paper style (an intentional departure from Obsidian), kept under selections, faint source only at the caret, hover previews, click to the definition, inline footnotes, Insert Footnote | Definitions stay editable text led by their number; no Reading view footnotes section |
| tasks | Clickable checkboxes in notes, embeds and callouts; checklist commands | Any status but a space is checked, like Obsidian's default theme; `data-task` attributes let a snippet style custom statuses |
| tags | Tag rendering and search, Explorer **Tags** view | Search results are a quick pick, not a search pane |
| suggest | `[[`, `[[#`, `[[^` and `#` completions | At most 50 results |
| search | `query` blocks with Obsidian's search syntax | No Dataview |
| outline | Explorer **Note Outline** | No drag to reorder sections |
| backlinks | Explorer **Backlinks** with unlinked mentions and a status bar count | Off by default (owner decision) |
| outgoingLinks | Explorer **Outgoing Links** | Off by default; no unlinked mentions section |
| quickSwitcher | **Quick Switcher** over notes, aliases and unresolved links | No key binding (Mod+O is VS Code's Open File); empty query lists recently modified notes |
| wordCount | Words and characters in the status bar | Counting rules are this extension's reading of Obsidian's |
| linkUpdates | Updates links when notes or folders are renamed in VS Code | Asks first by default (`prompt`); heading renames do not update links |
| folding | Heading and list folding, restored on reload | — |
| lineNumbers | Line numbers laid out like VS Code's gutter, following `editor.lineNumbers`; rendered blocks list all their source lines' numbers | On by default |
| gitGutter | Git change bars (added, modified, deleted) beside the line numbers against HEAD or the index, through VS Code's git extension; click a bar for a rendered peek with Revert and Stage File; Alt+F5 / Shift+Alt+F5 move between changes | On by default |
| indentGuides | Indentation guides | No active-guide highlight |
| spellcheck | The host's spellchecker | Dictionaries come from the OS |
| autoPair | Brackets, quotes and Markdown markers | — |
| smartLists | List continuation and exit | — |
| formatting | Bold, italics, strikethrough, highlight, code, comment, link, headings, lists, quote, line swaps | Only Mod+B, Mod+I, Mod+K are bound until the owner checks Obsidian's hotkeys |
| vim | Vim mode with `:w`, `:q`, `:u`, `:red` mapped to VS Code | Off by default |
| pasteHtml | Rich paste as Markdown | Images are not downloaded |
| agentBridge | **Copy Link for Agent** copies `@path#lines` and the quoted passage, opening a chat only when the editor's own chat is the only agent or a target is set | Not an Obsidian feature. The separate Copy for Agent command was removed (plain Ctrl+C copies text). No public API |
| bridge | **Copy Bridge Envelope** copies a versioned JSON selection. The hidden `bridge.envelope` command returns the same object. Agent PDF Viewer is called only when `vscodeEmbedPdf.bridge.envelope` is registered | Does not open a chat. The envelope is not wiki metadata. See `docs/bridge-envelope.md` |
| wiki | Reads `.wiki/layout.json` and the registry, reports pages inside the bundle, and copies a wiki reference or envelope | Does not run an agent, scaffold folders, or ingest inbox. A broken layout is not treated as legacy. Wikilinks are reported, not rewritten |
| assets | **Import Asset** copies a chosen file into the configured assets folder and inserts a portable Markdown link | The folder is created on import. No Obsidian attachment graph. A path inside the bundle is refused |
| scratch | **New Scratch Note** writes a temporary note outside the bundle. **Promote Scratch Note** files it as a Concept, Source Summary, Entity or Raw Source | No automatic ingest. Marp decks are not promoted. Collection indexes are not rewritten |
| marp | Detects `marp: true` and bridges to VS Code preview and Marp export. **Move Marp Deck Outside Bundle** keeps the deck's frontmatter | Slide widgets and Marp themes are not drawn here. A deck inside the bundle is not given a page contract |
| markers | Badges and actions that other extensions place on source ranges | Plain text only; at most 1,000 per plugin per editor |
| settings | Open Settings, Change Setting… (any contributed setting, edited by type), and commands to set the note font size and toggle line numbers, readable line width, Mermaid, inline title and Vim | Same keys as the Settings UI, no state of its own; Obsidian has no such commands |

## Workbench

- **Manage Plugins**, **Show Plugin Status** and **Use Markdown Workbench
  for Markdown in This Workspace**.
- A **Markdown Workbench** log output channel;
  `markdownWorkbench.debug.logging` adds debug lines from host and webview.
- Untrusted workspaces: no remote images, media or frames, and no external
  code block processors.

## API

API v1 (see [API.md](API.md)): editors, selections, agent references,
vault metadata and backlinks, the plugin catalog and states, and external
plugins with markers, actions, link handlers and code block processors.
Webview-side plugins from other extensions are not in v1.

## Not implemented

- Reading view, canvas, graph view, daily notes, templates, bookmarks,
  publish and sync.
- Obsidian community plugins and themes (CSS snippets that use `data-task`
  or similar attributes may work, but are not supported).
- Heading-rename link updates; performance measurement against DESIGN §20.
