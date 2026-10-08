# Copy for Agent

Copies an LLM Wiki-compatible `@path#start-end` reference for selected saved
Markdown, or offers to copy just the text. Obsidian has no built-in equivalent.

## How it works

The host captures a flushed, version-checked selection from the requested panel.
Core selection snapshots retain host identity and convert normalized wire offsets
to original source offsets. Dirty notes offer Save and Copy, Copy Text Only or
Cancel; saving recaptures the selection. The noninteractive service rejects dirty
notes. References use a workspace-relative path for one local workspace and a
full URI otherwise. Nothing is sent to an agent or chat.

## Files

- `manifest.ts`: command, default shortcut and selection-only title action.
- `api.ts`: agent service and immutable reference shape.
- `protocol.ts`: validated interactive copy request.
- `reference.ts`: path policy and LLM Wiki reference formatting.
- `agent.ts`: snapshot validation, dirty policy and clipboard write.
- `host.ts`: root service and resource-enabled panel handler lifetimes.
- `webview.ts`: command, contextual-widget menu contribution and cell-aware shortcut.

## Services, events and settings

Host provides `agent`, injecting `editors`, `selections` and `workbench`; webview
injects `editor`, `commands`, `document`, `rpc` and `menu`. Host listens to editor
open/close and configuration changes; saving awaits `document/willSave`. Webview
contributes to `editor/selectionMenu`. `plugins.copyForAgent.enabled` defaults to
true. Command: Copy for Agent; shortcut: Mod+Alt+C.

## Limits and differences from Obsidian

An untitled document cannot supply a disk reference until saved and reopened as
a file; Copy Text Only works without a disk path. Only Markdown Workbench panel
selections are supported. Saved line references do not export attachments,
snapshots or chat messages.

Static editor selection actions use VS Code's native webview context menu; table
actions continue through `editor/selectionMenu`.
