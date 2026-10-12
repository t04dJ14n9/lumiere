# gitDiffEditor

A side-by-side diff of two versions of a note, both rendered with the editor's
Markdown renderer and sanitizer. Blocks are aligned in one grid (shared engine
in `src/shared/diff`), changed words are marked, added and removed blocks face
a hatched spacer, and code, math and frontmatter diff line by line.

- **Open Rendered Git Diff** compares the active note with HEAD.
- With `diffEditor: rendered`, Markdown text diffs that VS Code opens (Source
  Control, Timeline) are closed and replaced by the rendered panel. **Text
  Diff** in the panel opens VS Code's diff and is not taken over again.
- The left side is read-only; the right side follows edits to the note.
- Disabling the plugin closes its panels and stops the takeover.

Host adapters: `src/host/diff-views.ts` (tabs, `vscode.diff`, the webview
panel); webview bundle: `src/webview/diff`.
