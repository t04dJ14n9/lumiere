# Commands

Run editing commands from VS Code's command palette and keyboard shortcuts,
using Obsidian-style editor command IDs for feature actions.

## How it works

The webview registry maps command IDs to handlers. Host actions flush pending
edits before crossing validated RPC; the host serializes each action through the
document session and checks panel focus before native operations. Feature command
registrations follow active-panel settings, with queued reconciliation and a
fresh enablement check when invoked. Registrations stop with their owning context.

Undo and redo are special: VS Code's webview shell always preventDefaults
Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y and forwards them to the workbench.
A capture-phase document listener owns those shortcuts for the note (flush, then
native history), stops the shell from seeing them, and leaves INPUT/TEXTAREA plus
Properties `[data-property-input]` / `[data-property-list-input]` contenteditables
to native DOM undo (not CodeMirror's contenteditable). Save stays on the
CodeMirror keymap with `stopPropagation` so the forwarder cannot run a second Save.
Ctrl/Cmd+E is owned the same way so `@replit/codemirror-vim` cannot treat it as
scroll-window (BH-003); the host Toggle Text Editor command runs instead
(Lumière product choice over Obsidian-vim scroll). Vim unmaps default `<C-p>` → `k` while enabled (BH-021) so Ctrl+P reaches Quick Open
or an open suggest list instead of line-up.

## Files

- `manifest.ts`: core identity and native action contributions.
- `api.ts`: command registration/execution service contract.
- `protocol.ts`: validated run-command and host-action channels.
- `host.ts`: per-panel host actions and native palette routing.
- `features.ts`: feature command ownership, reconciliation and invocation guards.
- `webview.ts`: registry, host actions, RPC and keyboard registrations.
- `history-keys.ts`: capture-phase Ctrl/Cmd+Z / Shift+Z / Y ownership so VS Code's
  webview key forwarding cannot double-fire or swallow note undo/redo.
- `history-keys.test.ts`: shortcut mapping, text-field and property-editor exemption, listener disposal.
- `toggle-text-editor-keys.ts`: capture-phase Ctrl/Cmd+E so Vim cannot
  scroll-window (BH-003); runs host `toggleTextEditor`.
- `toggle-text-editor-keys.test.ts`: Mod+E mapping and native-field skip.
- `registry.ts`: per-editor unique-ID command map.
- `registry.test.ts`: command results, duplicate rejection, removal and failures.

## Services, events and settings

Host injects the host services `hostCommands` and `settings`, plus `editors`; webview injects `rpc`, `editor` and
`document` and provides `commands`. Host listens to `editor/opened`,
`editor/closed` and `editor/activeChanged`, and serially emits `document/willSave`
before host actions. The core plugin has no enablement switch or separate config;
feature commands honor their feature settings and the active panel's preset.

## Limits and differences from Obsidian

Save, undo, redo, close and Open as Text use VS Code. An action that requires an
active panel fails if focus changes while it is flushing. Feature editor commands
route to the active webview rather than maintaining an independent host keymap.
