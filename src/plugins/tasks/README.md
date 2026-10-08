# Tasks

Makes Markdown task checkboxes clickable in Live Preview and embedded notes,
like Obsidian. Commands toggle checklist status or cycle list/checklist form.

## How it works

The inline renderer replaces task markers with widgets. A post-processor binds
checkboxes inside rendered blocks to their exact source lines. Local edits use
CodeMirror; embedded-note edits use validated RPC, and the host rechecks source
authorization and expected text before changing the native document. Pass/plugin
cleanup disables controls and removes listeners.

## Files

- `manifest.ts`: enablement and checklist command contributions.
- `protocol.ts`: validated task-toggle request and boolean result.
- `host.ts`: resource authorization and native-document edits.
- `webview.ts`: inline renderer and checklist command registrations.
- `widget.ts`: inline checkbox widget and event lifetime.
- `post-process.ts`: rendered checkbox binding, local and embedded edit routing.
- `edits.ts`: pure expected-line edits and checklist commands.
- `tasks.test.ts`: pure edit and command units.
- `host.test.ts`: authorization, stale-line and handler lifecycle units.

## Services, events and settings

Webview injects `editor`, `commands`, `livePreview` and `rpc`; host injects
`workbench`, `resources` and `rpc`. Provides no services. Listens to
`render/postProcess`; emits no kernel events. `markdownWorkbench.plugins.tasks.enabled`
defaults to true. Both checklist command bindings remain unbound for verification.

## Limits and differences from Obsidian

Preview-only tasks are disabled. Stale source lines reject edits, and embedded
sources must already be authorized by Resources. Text, saves and undo belong to
VS Code; exact interaction parity remains for the owner's manual pass.
