# Current-line authorship

Shows who last committed the caret line, when, and a truncated commit subject as quiet
text after the end of the line in Live Preview. Hovering the ghost opens a tooltip with
the full subject and commit body (GitLens-style). Obsidian has no core equivalent;
this follows GitLens current-line authorship alongside the Git change bars.

The ghost is drawn in a layer above the text, not inside the line, so it never
takes room: no line changes height or wraps for it, whatever its style (a
heading is taller), the text never moves under the caret, and clicks reach the
text beneath. It sits a gap after the end of the line's last row, centred on
that row, in one small UI type on every line, and uses the free space up to
the editor's right edge (the margin beside a readable-width column included).
When less than ten ems fit there, it is not shown.

## How it works

The webview sends the complete editor snapshot and main caret line to the host.
NativeGitAccess prefers `vscode.git`'s open repository, then falls back to
`git rev-parse --show-toplevel` when the API has not opened the work tree yet
(empty window, parent-folder prompt, or scan lag). Discovered roots enroll in
the same `RepositoryWatch` generation path via filesystem metadata watches on
`.git` (HEAD/refs/config), so terminal amends without a note edit still bump
generation and publish `changed`. It runs single-line porcelain blame against
HEAD with real stdin for snapshot contents. Document, caret-line and
repository changes clear the ghost immediately; only the next request waits
150ms. The ghost stays hidden until the first real caret move in the panel
(column-only counts); switching the document URI re-locks until the next move. A panel-local serial guards both success and rejection, including URI
changes and disable. Current replies can adopt the host's authoritative
repository generation. Only non-zero commit OIDs are shown, including boundary
commits. Identity is resolved through Git config for the “You” label.

## Files

- `manifest.ts`: default-off enablement and quiet settings title.
- `protocol.ts`: validated snapshot, result, identity and required generation messages.
- `host.ts`: panel-bound RPC and immediate repository invalidation.
- `epoch.ts`: document/caret/repository freshness comparisons.
- `controller.ts`: debounce, only-after-caret-move gate, latest-wins, generation adoption and lifetime guards.
- `state.ts`: transaction-owned version and blame state; immediate edit/line clear.
- `webview.ts`: controller, editor extensions and guarded identity requests.
- `format.ts`: VS Code template `subject, author (relative)`; grapheme-safe subject truncate (~50); hover tooltip text.
- `blameWidget.ts`: identity state, the caret line's ghost, its placement, and the layer that draws it.
- `blameTooltip.ts`: the full-message tooltip, shown by hit-testing the pointer (the ghost lets clicks through).
- `paintable.ts`: hide the ghost inside unrevealed Live Preview replaces.
- `gitBlame.css`: GitLens trailing-line color (`#99999959` when that token is absent), fixed small UI type, nowrap + ellipsis, click-through layer, hover tooltip, Source-mode hiding.

## Services, events and settings

Host injects the host service `git` and `rpc`; webview injects `editor` and `rpc`. Provides
no services, listens/emits no kernel events, and uses only its own RPC channel.
Repository changes arrive through injected GitAccess. One resource-scoped switch,
`lumiere.markdown.plugins.gitBlame.enabled`, defaults to false. It works
without `gitGutter` or `gitInline`; no commands or mutations.

## Limits and differences

Git must be available and the note tracked in HEAD. Empty, uncommitted,
untracked, stale, failing and over-cap snapshots show nothing; no error toasts.
The contents ceiling is the shared `MAX_DIFF_CHARS` (1,000,000 characters), with
an enforced five-second Git timeout. English relative time updates on editor
transactions; ghost text follows VS Code’s default blame template with subjects
at most 50 graphemes plus an ellipsis; hover shows the full message body from the host. No full-file blame, history, hashes, remote links, or
status-bar duplicate.
