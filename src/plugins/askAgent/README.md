# Ask Agent (plugin id `askAgent`)

**Ask Agent about Selection** hands an agent the selected saved Markdown: an
LLM Wiki-compatible `@path#start-end` reference, a blank line and the passage
quoted with `> `, so the agent both reads the exact words and can open the
note at that range. Obsidian has no built-in equivalent.

The separate Copy for Agent command (Mod+Alt+C, a title button and menu
items) was removed by owner decision: plain Ctrl/Cmd+C copies text. Nothing
was published, so the plugin was renamed from `copyForAgent` with no
migration, and the public API offers no agent methods or service.

## How it works

The host captures a flushed, version-checked selection from the requested panel.
Core selection snapshots retain host identity and convert normalized wire offsets
to original source offsets. Dirty notes offer Save and Copy, Copy Text Only or
Cancel; saving recaptures the selection. References use a workspace-relative
path for one local workspace and a full URI otherwise. `chat.ts` opens Cursor's
agent chat with the payload on the clipboard (Cursor offers no prefill), else
VS Code's chat with the payload prefilled and the question left to type, else
only copies; each case ends in a notice saying where the passage went.

## Files

- `manifest.ts`: the Ask Agent command and its editor context menu item.
- `protocol.ts`: validated interactive ask request.
- `reference.ts`: path policy and LLM Wiki reference formatting.
- `chat.ts`: picks the agent chat for Ask Agent about Selection.
- `agent.ts`: `AskAgent`: snapshot validation, dirty prompt and chat hand-off
  (with its clipboard fallback).
- `host.ts`: resource-enabled panel handler lifetimes.
- `webview.ts`: command and contextual-widget menu contribution.

## Services, events and settings

Host provides no service, injecting `editors`, `selections` and `workbench`;
webview injects `editor`, `commands`, `document`, `rpc` and `menu`. Host listens
to editor open/close and configuration changes; saving awaits
`document/willSave`. Webview contributes to `editor/selectionMenu`.
`plugins.askAgent.enabled` defaults to true. Command: Ask Agent about Selection
(no shortcut; selection menu and editor context menu).
`markdownWorkbench.askAgent.target` forces the agent.

## Limits and differences from Obsidian

An untitled document cannot supply a disk reference until saved and reopened as
a file; Copy Text Only works without a disk path. Only Markdown Workbench panel
selections are supported. Saved line references do not export attachments,
snapshots or chat messages.

Static editor selection actions use VS Code's native webview context menu; table
actions continue through `editor/selectionMenu`.
