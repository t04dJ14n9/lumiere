# Editor

Hosts the Markdown editing surface and keeps each panel's selection, scroll and
presentation independent, like separate Obsidian editor panes.

## How it works

The host creates one panel context and RPC endpoint for each native editor panel,
attached to a shared TextDocument session. The webview creates CodeMirror and
provides caller-bound extension registration, clipboard and menu services. The
host also provides `selections` for capture and validation; `editor/selectionMenu`
is an awaited menu-contribution waterfall.
Extensions sort by slot, catalog rank, owner ID and owner-local order in one
compartment. Persistence captures source identity and feature-owned contributions;
transfers flush first and reject a moving document version. Settings update a
separate compartment so user state survives reconfiguration.
Tab and Shift+Tab never leave the note, as in Obsidian: on a list item they
indent or outdent the item with its nested lines, with a selection they indent
the selected lines, and otherwise Tab inserts one indent unit.
Ctrl/Cmd+F opens an in-note find bar at the top right, like Obsidian's: it
shows "N / M" for the selected match (counting stops at 1000), Enter and
Shift+Enter (or F3, Ctrl/Cmd+G) move between matches, Aa toggles case,
Ctrl/Cmd+H or the ⇄ button shows the replace row (Enter replaces one,
Ctrl/Cmd+Enter or Replace all replaces all), and Escape closes it.
Note text and code use VS Code's editor font settings as they apply to Markdown
files, so `[markdown]` overrides count as in the built-in text editor:
`editor.fontFamily` (with a monospace fallback), `fontSize`, `fontWeight`,
`letterSpacing`, `fontLigatures` (off by default, as in VS Code) and
`fontVariations`, and `editor.lineHeight` with VS Code's own rule: at its
default (0) a line is 1.35 times the size (1.5 on macOS) rounded to whole
pixels, as in the built-in text editor (19px at 14px, not Obsidian's 1.5); a
value below 8 is a multiplier and a larger one is pixels. Headings keep
Obsidian's sizes and line heights. Code is the same size as the text. These
are native settings (`nativeConfigKeys`), not contributed again; `font.ts`
turns them into CSS variables, which `settings.ts` delivers as an editor theme
so a change makes CodeMirror measure the lines again (line numbers follow).
The native `editor.cursorStyle`, `cursorWidth`, `cursorBlinking` and
`cursorSmoothCaretAnimation` settings use the same manifest/configuration path.
A measured caret layer keeps block characters readable with VS Code's
`editorCursor.foreground` and `editorCursor.background` theme colours, and
keeps DOM elements in place so movement can animate. Modal plugins inject the
caret's mode and change notifications through the editor service;
`drawSelection` continues to draw selections. Explicit smooth animation applies
to selection moves, while `on` also animates typing and deletion.

## Files

- `selection.ts`: host-held frozen selection snapshots, source coordinates and stale validation.

- `manifest.ts`: core identity, indentation and native font/caret configuration schema.
- `font.ts`: editor font settings to the note's CSS variables.
- `caret.ts`: pure mode/settings mapping to caret dimensions and CSS variables.
- `caret-settings.ts`: validated native cursor fields and manifest keys.
- `caret-view.ts`: persistent caret DOM, modal sources and their cleanup.
- `caret-geometry.ts`: character/glyph/font measurements relative to the scroller.
- `caret.css`: theme colours, cursor shapes, blinking and movement transitions.
- `caret.test.ts`: native and modal cursor mapping units.
- Browser and real-editor specs: `test/browser/vim-caret.spec.ts` (settings), `test/browser/vim-caret-geometry.spec.ts` (graphemes, ligatures, lifecycle), `test/vscode/vim-caret.spec.ts` (against the built-in caret).
- `api.ts`: editor, panel, menu, view-state and event contracts.
- `protocol.ts`: schemas for handshake, selection, view state and clipboard RPC.
- `host.ts`: panel registry, editor service and active-context registrations.
- `panel.ts`: per-panel context, session connection and RPC lifetimes.
- `logging.ts`: webview log forwarding over RPC and its host-side receiver.
- `associations.ts`: **Use Markdown Workbench for Markdown in This Workspace**.
- `webview-html.ts`: CSP, scripts and native webview HTML.
- `indentation.ts`: Tab and Shift+Tab commands.
- `find.ts`, `find-panel.ts`, `find-count.ts`, `find.css`: in-note find and replace.
- `select-all.ts`: stops VS Code's own Select All from undoing the
  editor's Ctrl/Cmd+A (VS Code forwards every webview keydown).
- `webview.ts`: view creation and named service/settings/RPC registrations.
- `service.ts`: shared editor facade with caller-bound extension ownership.
- `extensions.ts`: deterministic ordered extension registry.
- `settings.ts`: CodeMirror editor settings, indentation and font presentation.
- `clipboard.ts`: validated clipboard RPC client.
- `contributions.ts`: feature-owned view-state validation and restoration.
- `persistence.ts`: view capture, restore and ordinary edit/scroll persistence.
- `view-state.ts`: geometric scroll anchoring and presentation restoration.
- `view-transfer.ts`: flushed, version-checked native view transfers.
- `extensions.test.ts`: ordering, owner tie-breaks and retained state units.
- `settings.test.ts`: indentation settings and compartment preservation units.
- `contributions.test.ts`: contribution capture, late restoration and validation.
- `clipboard.test.ts`: clipboard RPC lifecycle units.

## Services, events and settings

Host injects `workbench` and `documents`, provides `editors`, and emits/listens to
`editor/opened`, `editor/closed` and `editor/activeChanged`. Webview injects
`document`, `markdown` and `rpc`, provides `editor` and `menu`, listens to
`document/syncStatus`, calls `editor/projectSelection`, and emits
`editor/clearProjection` and `editor/modeRestored`. Selection changes notify the
host through the editor channel. Core settings are `editor.useTabs` (true) and
`editor.tabSize` (4, integer 1–16), under `markdownWorkbench`.

Each panel kernel logs through the window's logger, tagged with the panel ID,
to the **Markdown Workbench** output channel. The webview forwards its logs over
the editor channel (`log`) at warn and above, and at debug too while
`markdownWorkbench.debug.logging` (default false) is on; the host re-checks that
setting before writing a forwarded debug line.

**Use Markdown Workbench for Markdown in This Workspace** writes `*.md` and
`*.markdown` into the workspace's `workbench.editorAssociations`, keeping its
other entries. The editor is otherwise only an option for Markdown (DESIGN
§25.2), so it does not take over every README; this makes a workspace behave
like an Obsidian vault, where notes always open in the editor.

`editor.reclaimTextEditor` (`auto`/`on`/`off`, auto meaning on in Cursor
only) is read by the host (`src/host/reclaim.ts`): a note the workspace routes
here that shows up in the plain text editor, as Cursor's **Preview |
Markdown** switch does, is reopened in this editor and the text tab closed.
**Open as Text** and a just-reclaimed note keep the text editor for 10 s.

## Limits and differences from Obsidian

VS Code owns text, saving and undo. The core editor cannot be disabled. Feature
state belongs to its contributing plugin; inactive/unknown contribution keys
are retained. Legacy top-level `folded`/`folds` fields remain readable compatibility
inputs. Structured clipboard and HTML conversion are owned by their features.

Editor config owns default mode, readable line length (700 px), strict rendered
line breaks, right-to-left direction, tabs and tab size. Changing default mode
does not overwrite an existing pane's presentation. Static commands use the native
webview context section; contextual widgets retain their menu service.

Host actions contribute plain labels to Note Actions (title) and Selection Actions
(context/palette). Selection callbacks receive freshly captured host-held
snapshots. The owner is rechecked after flushing/capture; provider disposal removes
its entries and revokes retained service handles. There are no default shortcuts.

- `actions-api.ts`: title/selection action service contract.
- `actions-protocol.ts`: data-only action messages.
- `actions.ts`: owner registry and native action picker.
- `actions-host.ts`: caller-bound service, panel RPC and context keys.
- `actions-webview.ts`: contextual selection-menu contributions.

Host provides `editorActions`; webview listens to `editor/selectionMenu` and the
action-registry notifications. Callbacks remain in the extension host.
