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
- **Peek.** Clicking any bar, including a pure **addition** (or **Show Git
  Change**, Alt+F3) opens a block widget below the change: a raw unified diff
  with the baseline and working-tree line numbers. Live Preview outside the peek
  stays rendered. ↑/↓ move to the adjacent change. **Revert** replaces that hunk
  with the baseline text as one undo step, and only when the shared mutation
  gate accepts that exact hunk and the buffer is still the snapshot it checked.
  An edit that only changes surrounding context keeps that same deleted and
  added text, so Revert stays available. A changed or grown payload, and a
  nearest display rematch when the change is gone, keep the original hunk id.
  Revert stays off and does not edit the neighbor or the newer text. **Stage**
  stays disabled:
  there is no hunk-scoped stage API, and the button must not save or stage the
  whole file. **Open Full Diff** opens this comparison's base → target.
  Escape or ✕ closes the peek.
- **Bar titles.** Each gutter bar's `title` / `aria-label` is `added`,
  `modified`, or `deleted` so the color meaning is clear on hover.
- **Navigation.** **Go to Next/Previous Git Change** (Alt+F5 / Shift+Alt+F5)
  move the caret, wrapping at the ends, and carry an open peek along.
- **Service.** Provides `gitDiff` (`api.ts`): the hunk `StateField`, the
  baseline, `revert`, and `openHunk`. Emits `git-diff:open-full` when Open Full
  Diff is used. `gitInline` builds on the service.
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
- `peek.ts`: peek state and placement.
- `peek-widget.ts`: the raw unified peek.
- `session.ts`: the editor's DiffSnapshot.
- `mutations.ts`: hunk-scoped Stage/Revert through the shared gate.
- `webview.ts`: the model, commands and wiring.
- `gitGutter.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.
