# Source markers

Shows source-bound badges supplied by plugins, including actions such as opening
a question about a passage. Obsidian has no direct core equivalent.

## How it works

The host binds each consumer to its own marker/action namespace. Sets replace one
owner's markers for one panel atomically, with validated ranges and bounded
labels. Native source changes remap markers, then host snapshots convert CRLF
source positions to wire positions. The webview maps accepted and unconfirmed
edits and renders badges after text or rendered blocks. Monotonic snapshot
revisions prevent late initial replies from replacing newer sets. Actions are
looked up by owner and marker identity, never arbitrary command text from the UI.

## Files

- `manifest.ts`: core plugin declaration.
- `api.ts`: source markers and caller-owned service.
- `protocol.ts`: bounded marker, snapshot and activation schemas.
- `revisions.ts`: source history, exact edit mapping and deleted-range rules.
- `store.ts`: panel/owner sets, action dispatch and snapshot publication.
- `host.ts`: caller binding, panel handlers and document subscriptions.
- `view-state.ts`: wire history, local mapping and marker state.
- `decorations.ts`: plain-text badges and actions.
- `webview.ts`: initial/live snapshots, ordering and extension disposal.
- `markers.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Host provides replaceable `markers`, injecting `editors`; webview injects `editor`
and `rpc`, optionally `livePreview.visiblePosition`. Host listens to editor
open/ready/close and `document/changed`; the view observes document wire updates.
No user feature switch, commands or keybindings: this is a core service whose
providers dispose their own sets/actions. Replacing the service is a kernel
capability; public provider contributions follow the API's ownership rules.

## Limits and differences from Obsidian

At most 1,000 markers per owner per editor; label 120 and tooltip 1,000 characters,
plain text only. Host mapping retains 128 native revisions, and the view retains
512 wire changes; unknown older source versions are rejected. Deleting a whole
nonempty range drops its badge. No LLM Wiki folder watcher or query resolver is
built in. Badges are generic and provider-driven.
