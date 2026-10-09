# Copy for Agent

Copies an LLM Wiki-compatible `@path#start-end` reference for selected saved
Markdown followed by the selected passage quoted with `> `, so an agent both
reads the exact words and can open the note at that range. Ask Agent about
Selection hands the same payload to a chat. Obsidian has no built-in equivalent.

## How it works

The host captures a flushed, version-checked selection from the requested panel.
Core selection snapshots retain host identity and convert normalized wire offsets
to original source offsets. Dirty notes offer Save and Copy, Copy Text Only or
Cancel; saving recaptures the selection. The noninteractive service rejects dirty
notes. References use a workspace-relative path for one local workspace and a
full URI otherwise. Copy for Agent sends nothing to a chat. Ask Agent about
Selection (`chat.ts`) opens Cursor's agent chat with the payload on the
clipboard (Cursor offers no prefill), else VS Code's chat with the payload
prefilled and the question left to type, else only copies; each case ends in a
notice saying where the passage went.

## Files

- `manifest.ts`: command, default shortcut and selection-only title action.
- `api.ts`: agent service and immutable reference shape.
- `protocol.ts`: validated interactive copy request.
- `reference.ts`: path policy and LLM Wiki reference formatting.
- `chat.ts`: picks the agent chat for Ask Agent about Selection.
- `agent.ts`: snapshot validation, dirty policy and clipboard write.
- `host.ts`: root service and resource-enabled panel handler lifetimes.
- `webview.ts`: command, contextual-widget menu contribution and cell-aware shortcut.

## Services, events and settings

Host provides `agent`, injecting `editors`, `selections` and `workbench`; webview
injects `editor`, `commands`, `document`, `rpc` and `menu`. Host listens to editor
open/close and configuration changes; saving awaits `document/willSave`. Webview
contributes to `editor/selectionMenu`. `plugins.copyForAgent.enabled` defaults to
true. Commands: Copy for Agent (Mod+Alt+C) and Ask Agent about Selection (no
shortcut; selection menu and editor context menu).

## Limits and differences from Obsidian

An untitled document cannot supply a disk reference until saved and reopened as
a file; Copy Text Only works without a disk path. Only Markdown Workbench panel
selections are supported. Saved line references do not export attachments,
snapshots or chat messages.

Static editor selection actions use VS Code's native webview context menu; table
actions continue through `editor/selectionMenu`.
