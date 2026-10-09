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
| editor | The CodeMirror editor in a webview, view state per panel, settings for mode, readable line length (700 px, off by default), strict line breaks, right-to-left, tabs | Panels of one note keep separate selections, scroll and folds |
| dialect | Obsidian-flavoured Markdown: wikilinks, embeds, tags, highlights, comments, callouts, footnotes, math, block IDs | Grammar is fixed; plugins cannot change parsing |
| render | Sanitized HTML for rendered blocks | Scripts, forms, objects, embeds and `srcdoc` are removed; application links (`obsidian:`, `zotero:`) are kept and confirmed before opening |
| livePreview | Syntax hidden except where the selection is; rendered blocks crossed as one unit | No Reading view (DESIGN §25.8); comments stay visible, faint, as in Obsidian |
| commands | Obsidian editor command IDs, save/undo/redo/close, Open as Text | Commands act on the active panel |
| vault | Index of every note: link resolution like Obsidian's, resolved and unresolved links, tags, aliases, headings, blocks | `.obsidian` marks a vault; without it the workspace folder is the vault. 50,000-file cap; hidden folders and `node_modules` skipped |
| resources | Contained file access for embeds and previews | Files outside the vault and escaping symlinks are refused |

## Features (on by default unless noted)

| Plugin | What it does | Differences and limits |
| --- | --- | --- |
| properties | The properties sheet: every type, chips, type menu, sort, drag, structured copy and paste | Type choices are stored per vault by this extension |
| inlineTitle | The file name above the note; edit it to rename | Only saved local files can be renamed |
| links | Click to follow, Mod-click in source, open to side, create missing notes, unresolved links dimmed | Markdown links and links inside embeds are not dimmed |
| embeds | Notes, sections, blocks, images (with an inspector), audio, video, PDF cards | PDFs open in their own editor rather than inline; remote media needs a trusted workspace |
| pagePreview | Mod-hover preview of notes, headings, blocks and attachments | External links are not previewed |
| tables | Spreadsheet-style table editing, selection, TSV clipboard, row and column commands and dragging | — |
| callouts | All callout types, nesting, folding with per-panel memory | Colours follow the VS Code theme |
| math | MathJax inline and block math | No user macros |
| diagrams | Mermaid | Theme follows VS Code light or dark; HTML labels off |
| codeBlocks | Prism highlighting and a Copy button | Languages without a loaded grammar stay plain |
| footnotes | Superscript numbers in reading order, hover previews, click to the definition, inline footnotes, Insert Footnote | Definitions stay source, as in Obsidian's Live Preview; no Reading view footnotes section |
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
| indentGuides | Indentation guides | No active-guide highlight |
| spellcheck | The host's spellchecker | Dictionaries come from the OS |
| autoPair | Brackets, quotes and Markdown markers | — |
| smartLists | List continuation and exit | — |
| formatting | Bold, italics, strikethrough, highlight, code, comment, link, headings, lists, quote, line swaps | Only Mod+B, Mod+I, Mod+K are bound until the owner checks Obsidian's hotkeys |
| vim | Vim mode with `:w`, `:q`, `:u`, `:red` mapped to VS Code | Off by default |
| pasteHtml | Rich paste as Markdown | Images are not downloaded |
| copyForAgent | Copies `@path#lines` references for coding agents | Not an Obsidian feature |
| markers | Badges and actions that other extensions place on source ranges | Plain text only; at most 1,000 per plugin per editor |

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
