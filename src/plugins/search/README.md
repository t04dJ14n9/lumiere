# Search blocks

Shows matching vault files inside fenced `query` blocks, corresponding to
Obsidian's embedded search results.

## How it works

A query-specific block renderer precedes generic code blocks. Each rendered fence
owns an RPC subscription; refresh, source exposure and disposal cancel old work.
The host lists eligible indexed files, reads current text through the shared
vault service, and sends each document to a worker. A conservative query plan
uses indexed tags/properties and file paths without reading note content when
possible; mixed content predicates read one coherent current text snapshot. Per-document parse errors are
counted; timeout or cancellation terminates the worker. Index resolution refreshes
live subscriptions. Result links use encoded relative paths and normal navigation.

## Files

- `manifest.ts`: enablement and surfaces.
- `protocol.ts`: query, response and change-notification schemas.
- `worker-protocol.ts`: validated worker startup, submissions and replies.
- `runner.ts`: worker startup, deadlines, pending requests and termination.
- `query.ts`: indexed file eligibility, cached metadata/live reads and result ordering.
- `../../markdown/search/plan.ts`: scope-aware content/metadata requirements.
- `host.ts`: RPC handlers and index change notification.
- `client.ts`: subscriptions, refresh generations and cancellation.
- `blocks.ts`: accessible status, refresh button and result links.
- `webview.ts`: query renderer and rendered-fence ownership.
- `../../workers/search.ts`: isolated query compilation and evaluation entry.

## Services, events and settings

Host injects `rpc`, `vault`, `vaults` and `workbench`; webview injects `editor`,
`rpc`, `render` and `livePreview`. Provides no service. Listens to `render/fence`
and the index's resolution subscription. The `search/changed` RPC notification
refreshes active queries. `markdownWorkbench.plugins.search.enabled` defaults to
true; no assigned keybindings or palette command.

## Limits and differences from Obsidian

Uses the documented pure search grammar; no Dataview scripting. Worker startup
has a 15-second deadline and each document has a 5-second evaluation deadline.
A failed worker affects its query only. Results reflect the index's eligible files
and unsaved text available through the host. Large vault searches may be slow;
results arrive together rather than streaming. Excluded files are omitted.
