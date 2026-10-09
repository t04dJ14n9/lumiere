# Ask Agent (plugin id `copyForAgent`)

**Ask Agent about Selection** hands an agent the selected saved Markdown: an
LLM Wiki-compatible `@path#start-end` reference, a blank line and the passage
quoted with `> `, so the agent both reads the exact words and can open the
note at that range. Obsidian has no built-in equivalent.

The separate Copy for Agent command (Mod+Alt+C, a title button and menu
items) was removed by owner decision: plain Ctrl/Cmd+C copies text. The
plugin id stays `copyForAgent` so `markdownWorkbench.plugins.copyForAgent.enabled`
keeps working, and the public API keeps `createAgentReference` and
`copyForAgent` (which copies the same text without prompts) for existing
callers.

## How it works

The host captures a flushed, version-checked selection from the requested panel.
Core selection snapshots retain host identity and convert normalized wire offsets
to original source offsets. Dirty notes offer Save and Copy, Copy Text Only or
Cancel; saving recaptures the selection. The noninteractive API rejects dirty
notes. References use a workspace-relative path for one local workspace and a
full URI otherwise. `chat.ts` opens Cursor's agent chat with the payload on the
clipboard (Cursor offers no prefill), else VS Code's chat with the payload
prefilled and the question left to type, else only copies; each case ends in a
notice saying where the passage went.

## Files

- `manifest.ts`: the Ask Agent command and its editor context menu item.
- `api.ts`: agent service and immutable reference shape.
- `protocol.ts`: validated interactive ask request.
- `reference.ts`: path policy and LLM Wiki reference formatting.
- `chat.ts`: picks the agent chat for Ask Agent about Selection.
- `agent.ts`: snapshot validation, dirty policy, clipboard write and chat hand-off.
- `host.ts`: root service and resource-enabled panel handler lifetimes.
- `webview.ts`: command and contextual-widget menu contribution.

## Services, events and settings

Host provides `agent`, injecting `editors`, `selections` and `workbench`; webview
injects `editor`, `commands`, `document`, `rpc` and `menu`. Host listens to editor
open/close and configuration changes; saving awaits `document/willSave`. Webview
contributes to `editor/selectionMenu`. `plugins.copyForAgent.enabled` defaults to
true. Command: Ask Agent about Selection (no shortcut; selection menu and editor
context menu). `markdownWorkbench.askAgent.target` forces the agent.

## Limits and differences from Obsidian

An untitled document cannot supply a disk reference until saved and reopened as
a file; Copy Text Only works without a disk path. Only Markdown Workbench panel
selections are supported. Saved line references do not export attachments,
snapshots or chat messages.

Static editor selection actions use VS Code's native webview context menu; table
actions continue through `editor/selectionMenu`.
