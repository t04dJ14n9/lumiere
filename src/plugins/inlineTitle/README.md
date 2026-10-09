# Inline title

Shows the note's filename above its content and lets you rename it there, like
Obsidian's Show inline title setting. Off by default (owner decision,
2026-10-09), so line 1 starts at the top as in VS Code's text editor; turn on
`markdownWorkbench.plugins.inlineTitle.enabled`. When on, the title remains
visible in Source mode.

## How it works

A block widget keeps the editable title outside the Markdown text. Its controller
handles IME, blur, validation, pending responses and keyboard focus. Rename uses
validated RPC; the root host half flushes all views, captures each panel by ID,
checks the document version, then requests a native same-folder rename. Reopened
groups restore independent view state after their webviews initialize, active
last. Properties focus uses typed events rather than another plugin's DOM internals.

## Files

- `manifest.ts`: default enablement and runtime surfaces.
- `protocol.ts`: rename/result/focus schemas and transfer validation.
- `title.ts`: filename display and safe same-folder target construction.
- `webview.ts`: title registration, RPC and focus events.
- `widget.ts`: title state field and widget reconciliation/lifetime.
- `input.ts`: draft, IME, commit/cancel and keyboard behavior.
- `host.ts`: per-panel RPC enablement and initialized-view restoration.
- `rename.ts`: flush/capture/version checks and native rename orchestration.
- `transfers.ts`: original-panel-ID ownership of pending view transfers.
- `../../../test/unit/inline-title/title.test.ts`: title/schema unit coverage.
- `../../../test/unit/inline-title/rename.test.ts`: split-view, stale/cancel/error units.
- `../../../test/unit/inline-title/host.test.ts`: RPC enablement and disposal units.
- `inlineTitle.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Webview injects `editor` and `rpc`; host injects `editors` and `workbench`.
Provides no service. Listens to `editor/focusTitle`, `editor/opened`,
`editor/closed` and `editor/ready`; queries `editor/focusProperties` with bail
semantics. `markdownWorkbench.plugins.inlineTitle.enabled` defaults to false.
The title is out of the Tab order, so a stray Tab or Shift+Tab in the note never
lands in it; click it or press Up on the first line. Enter/Tab commit to body,
Escape cancels, Down moves to Properties and Alt+Down
to body. No palette command or default global binding.

## Limits and differences from Obsidian

Only saved local Markdown files can be renamed. Names cannot contain separators,
line breaks, NUL or colon and are limited to 255 characters. VS Code owns the
rename and incoming-link updates; conflict errors keep the original file intact.
Transfers match newly created panels by target and editor group while retaining
original panel IDs, never by filename alone. Full native rename/IME acceptance
requires the owner's manual pass.
