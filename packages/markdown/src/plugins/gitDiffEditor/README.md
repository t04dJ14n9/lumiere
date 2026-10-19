# gitDiffEditor

Shows two versions of a note as rendered Markdown side by side, with changed
words and lines marked. Obsidian has no built-in Git diff editor equivalent.

## How it works

The command compares the active note with HEAD. With `diffEditor: rendered`,
the host replaces Markdown text diffs opened by Source Control or Timeline;
**Text Diff** opens the native comparison again. The title is
`name (base → target)`. **Open Full Diff** from a change-bar peek opens that
snapshot's sides, and `diffEditor: native` keeps VS Code's text diff. Panels follow text-document
edits, repository changes and working-file events until disposal. Blocks align
in one grid and render as fragments with reference definitions supplied through
parser context. Each side resolves images through the existing contained
resource pipeline; Git sides read revision bytes. Unavailable images show their
source text.

## Files

- `manifest.ts`: settings and command contributions.
- `host.ts`: native takeover, comparison reads and panel refresh lifetime.
- `comparison.ts`: URI sides, source state and base → target titles.
- `open-snapshot.ts`: Open Full Diff from a peek snapshot.
- `resources.ts`: independent image resolvers for the two sides.
- `src/host/diff-views.ts`: native tabs and webview panel adapter.
- `src/host/diff-image-url.ts`: local image URLs, revision bytes and resource roots.
- `src/shared/diff-panel-protocol.ts`: validated panel messages.
- `src/webview/diff/main.ts`: sanitized rendering and image requests.
- `src/webview/diff/rows.ts`: fragment rows and side-specific definition context.
- `src/webview/diff/definitions.ts`: reference and footnote context discovery.
- `src/webview/diff/images.ts`: image enhancement and source fallback.
- `src/webview/diff/panel.ts`: aligned grid and change controls.
- `src/webview/diff/step.ts`: change navigation.
- `src/webview/diff/diff.css`: panel presentation.

## Services, events and settings

Injects the host services `hostDocuments`, `hostCommands`, `dialogs`, `activeEditor`, `settings`, `workspace`, `git` and `diffViews`, plus optionally `diffResources`; provides no services or kernel
events. Listens for `git-diff:open-full`. Subscribes to native diff tabs, document
changes, Git repository changes and working-file events. `gitDiffEditor.diffEditor`
selects `native` (default)
or `rendered`. The plugin enablement setting controls takeover and closes owned
panels on disable.

## Limits and differences from Obsidian

The comparison is read-only; **Open File** opens the note for editing. Images
must resolve through the current vault index and containment checks. Assets
missing from that index or an unavailable Git revision show a source fallback.
Resource roots contain only the extension bundle and the compared notes' vaults;
the image CSP allows their webview URLs and revision data URLs.
