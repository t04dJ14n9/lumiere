# Git change bars

VS Code's quick diff in the rendered editor: a 3px bar beside the line numbers
for each added (green), modified (blue) or removed (red triangle) range, against
`HEAD` or the index (`markdownWorkbench.gitGutter.compareTo`). On by default.

## How it works

- **Baseline.** The host half asks VS Code's built-in git extension
  (`vscode.git`, API 1, wrapped by `src/host/git.ts` as `workbench.git`) for the
  note's text at `HEAD` (`repository.show`) or in the index. It never runs git
  itself. HEAD text is cached per commit. The webview asks again when the
  repository changes (commit, checkout, stage). Without git, a repository, or a
  tracked file, the plugin stays active and shows nothing.
- **Hunks.** `src/shared/diff` (Myers line diff, shared with the inline and
  rendered diff plugins) turns baseline and buffer into hunks, 250 ms after
  typing stops. Until then the bars are mapped through each edit's `ChangeSet`,
  so they never jump. Files over 1 MB or 20,000 lines get no bars.
- **Gutter.** Its own CodeMirror gutter, ranked between `lineNumbers` and
  `folding` (plugin-order.ts), so it sits where VS Code draws quick diff. A
  rendered block (table, properties, callout) gets one bar for the whole block,
  as it gets one line number; a removal inside it marks it modified.
- **Peek.** Clicking a bar (or **Show Git Change**, Alt+F3) opens a block widget
  below the change: the baseline and working-tree versions rendered through
  `render`, aligned by block, with changed words in `<del>`/`<ins>` and changed
  code lines tinted. ↑/↓ move to the adjacent change, **Revert** replaces the
  hunk with the baseline text as one undo step, **Stage File** saves and stages
  the file (the git API has no hunk staging), Escape or ✕ closes it.
- **Navigation.** **Go to Next/Previous Git Change** (Alt+F5 / Shift+Alt+F5)
  move the caret, wrapping at the ends, and carry an open peek along.
- **Service.** Provides `gitDiff` (`api.ts`): the hunk `StateField`, the
  baseline and `revert`. `gitInline` builds on it.
- **Colours.** Theme variables only, through the tokens in
  `src/webview/styles/git-diff.css` (`editorGutter.*Background`,
  `diffEditor.*Background`, `peekView*`).

Turning the plugin off removes the gutter, the peek, the commands, the RPC
handlers and the repository listener.

## Files

- `manifest.ts`, `protocol.ts`, `api.ts`: switch, settings, commands, RPC, service.
- `host.ts`: baseline and stage through `workbench.git`; repository change notifications.
- `hunks.ts`: hunk state, mapping, revert edits.
- `gutter.ts`: the bar gutter.
- `peek.ts`: the peek widget.
- `webview.ts`: the model, commands and wiring.
- `gitGutter.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.
