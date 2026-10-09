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

## Files

- `selection.ts`: host-held frozen selection snapshots, source coordinates and stale validation.

- `manifest.ts`: core identity and indentation configuration schema.
- `api.ts`: editor, panel, menu, view-state and event contracts.
- `protocol.ts`: schemas for handshake, selection, view state and clipboard RPC.
- `host.ts`: panel registry, editor service and active-context registrations.
- `panel.ts`: per-panel context, session connection and RPC lifetimes.
- `logging.ts`: webview log forwarding over RPC and its host-side receiver.
- `webview-html.ts`: CSP, scripts and native webview HTML.
- `webview.ts`: view creation and named service/settings/RPC registrations.
- `service.ts`: shared editor facade with caller-bound extension ownership.
- `extensions.ts`: deterministic ordered extension registry.
- `settings.ts`: CodeMirror indentation extensions.
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
