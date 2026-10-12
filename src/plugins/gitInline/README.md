# Inline git changes

Track changes in the rendered note, over the hunks of the Git change bars
(`gitGutter`): removed words struck through, added words and lines tinted, and
the old version of a changed table, code block or frontmatter shown above it.
Off by default; **Markdown Workbench: Toggle Inline Git Changes** flips
`markdownWorkbench.plugins.gitInline.enabled`.

## How it works

- **Dependency.** Injects `gitDiff`, the service `gitGutter` provides, so it
  reads the same baseline and hunks and never asks git itself. With the bars
  off it is `pending` and draws nothing.
- **Prose.** A modified paragraph, heading or list is word-diffed
  (`src/shared/diff`). Added words get a mark decoration on the real text
  (`mw-gd-ins`); removed words are inline widgets (`<del class="mw-gd-del">`)
  where they were, which the caret skips and copying leaves out.
- **Rendered blocks.** Tables, code blocks, math and frontmatter render as one
  widget in Live Preview, where marks on the source would not show. A change in
  one gets a ghost block above it: the baseline rendered through `render`,
  dimmed, with its changed words or code lines marked, labelled "Before · line N
  in HEAD", and **Restore**. The block's lines are tinted modified.
- **Removed blocks.** A ghost struck through, labelled "Removed", with
  **Restore** (one undo step through `gitDiff.revert`).
- **Added lines.** Tinted with the diff editor's inserted-line colour.
- Decorations are rebuilt when the bars recompute and mapped through edits in
  between. Colours come from `src/webview/styles/git-diff.css`.

Turning it off removes every decoration and widget; the note is untouched.

## Files

- `manifest.ts`: switch (off by default).
- `decorations.ts`: word marks, removed-word widgets and ghost blocks.
- `webview.ts`: wiring.
- `gitInline.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.
