# Current-line authorship

Shows who last committed the caret line, when, and the commit subject as quiet
text at the end of the line in Live Preview. Obsidian has no core equivalent;
this follows GitLens current-line authorship alongside the Git change bars.

## How it works

The webview sends the complete editor snapshot and main caret line to the host.
NativeGitAccess prefers `vscode.git`'s open repository, then falls back to
`git rev-parse --show-toplevel` when the API has not opened the work tree yet
(empty window, parent-folder prompt, or scan lag). It runs single-line porcelain
blame against HEAD with real stdin for snapshot contents. Document, caret-line and
repository changes clear the ghost immediately; only the next request waits
150ms. A panel-local serial guards both success and rejection, including URI
changes and disable. Current replies can adopt the host's authoritative
repository generation. Only non-zero commit OIDs are shown, including boundary
commits. Identity is resolved through Git config for the “You” label.

## Files

- `manifest.ts`: default-on enablement and quiet settings title.
- `protocol.ts`: validated snapshot, result, identity and required generation messages.
- `host.ts`: panel-bound RPC and immediate repository invalidation.
- `epoch.ts`: document/caret/repository freshness comparisons.
- `controller.ts`: debounce, latest-wins, generation adoption and lifetime guards.
- `state.ts`: transaction-owned version and blame state; immediate edit/line clear.
- `webview.ts`: controller, editor extensions and guarded identity requests.
- `format.ts`: author, relative time and grapheme-safe subject formatting.
- `blameWidget.ts`: one decorative EOL widget and identity state.
- `gitBlame.css`: quiet theme styling and Source-mode hiding.

## Services, events and settings

Host injects `workshop` and `rpc`; webview injects `editor` and `rpc`. Provides
no services, listens/emits no kernel events, and uses only its own RPC channel.
Repository changes arrive through injected GitAccess. One resource-scoped switch,
`markdownWorkshop.plugins.gitBlame.enabled`, defaults to true in the Obsidian
preset. It works without `gitGutter` or `gitInline`; no commands or mutations.

## Limits and differences

Git must be available and the note tracked in HEAD. Empty, uncommitted,
untracked, stale, failing and over-cap snapshots show nothing; no error toasts.
The contents ceiling is the shared `MAX_DIFF_CHARS` (1,000,000 characters), with
an enforced five-second Git timeout. English relative time updates on editor
transactions; subjects use at most 48 graphemes plus an ellipsis. No full-file
blame, hover details, history, hashes, remote links, or status-bar duplicate.
