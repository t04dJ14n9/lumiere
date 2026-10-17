# Tasks

Makes Markdown task checkboxes clickable in Live Preview and embedded notes,
like Obsidian. Commands toggle checklist status or cycle list/checklist form.

## How it works

The inline renderer replaces task markers with widgets and gives each task
line `md-task-line` with its status in `data-task`. Any status other than a
space is checked, as in Obsidian: the checkbox shows a check and the line is
muted and its text struck through, in Live Preview and in rendered blocks alike.
Rendered list items and checkboxes carry `data-task` too, so a CSS snippet can
style custom statuses (`[/]`, `[-]`) the way Obsidian themes do. A post-processor binds
checkboxes inside rendered blocks to their exact source lines. Local edits use
CodeMirror; embedded-note edits use validated RPC, and the host rechecks source
authorization and expected text before changing the native document. Pass/plugin
cleanup disables controls and removes listeners.

Inline checkbox mouse presses prevent native focus transfer. The click still
activates the checkbox, but the editor retains its caret focus when the toggle
replaces the widget. Toggle edits do not request selection or scrolling changes.

## Files

- `manifest.ts`: enablement and checklist command contributions.
- `protocol.ts`: validated task-toggle request and boolean result.
- `host.ts`: resource authorization and native-document edits.
- `webview.ts`: inline renderer and checklist command registrations.
- `widget.ts`: inline checkbox widget and event lifetime.
- `post-process.ts`: rendered checkbox binding, local and embedded edit routing.
- `edits.ts`: pure expected-line edits and checklist commands.
- `status.ts`: a task line's class and `data-task` attribute.
- `../../../test/unit/tasks/status.test.ts`: checked styling for every status
  and `data-task` output.
- `tasks.test.ts`: pure edit and command units.
- `host.test.ts`: authorization, stale-line and handler lifecycle units.
- `tasks.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Webview injects `editor`, `commands`, `livePreview` and `rpc`; host injects
the host service `hostDocuments`, `resources` and `rpc`. Provides no services. Listens to
`render/postProcess`; emits no kernel events. `markdownWorkshop.plugins.tasks.enabled`
defaults to true. Both checklist command bindings remain unbound for verification.

## Limits and differences from Obsidian

Preview-only tasks are disabled. Stale source lines reject edits, and embedded
sources must already be authorized by Resources. Text, saves and undo belong to
VS Code; exact interaction parity remains for the owner's manual pass.
