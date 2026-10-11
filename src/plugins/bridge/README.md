# Bridge

Builds a versioned JSON envelope for the current selection: who the source is, how to reopen it, the selected text, when it was captured, and which revision it came from. Copy Bridge Envelope puts that JSON on the clipboard and does not open a chat. Copy Link for Agent remains the separate `agentBridge` command.

## How it works

The active Markdown Workbench selection becomes an envelope (`producer: markdown`). A saved file gets a durable `@path#lines` locator and a whole-source hash. A dirty or untitled note keeps the selection hash and a temporary view id, and omits the whole-source hash. When this editor has no selection, the plugin calls `vscodeEmbedPdf.bridge.envelope` only if that command is registered. A missing PDF extension returns nothing and does not throw. Other extensions can call the hidden command `markdownWorkbench.bridge.envelope`. The contract is `docs/bridge-envelope.md`.

## Files

- `host.ts`: the service and the two commands.
- `capture.ts`: Markdown selection to envelope, and the PDF result check.
- `api.ts`: `bridgeCapture`.
- `manifest.ts`: commands.

## Services, events and settings

- Requires `workbench`. Optionally uses `editors` and `selections`.
- Provides `bridgeCapture`.
- Does not listen to events.
- Setting: `markdownWorkbench.plugins.bridge.enabled`.

## Limits and differences from Obsidian

- This is not an Obsidian feature. The envelope is a workbench protocol, not wiki metadata.
- The plugin does not start an agent and does not share navigation history with Agent PDF Viewer or a browser.
- Clipboard text for Copy Link for Agent stays the LLM Wiki `@path#lines` wording. The JSON envelope is a second command.
