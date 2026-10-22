# Changelog

## 0.1.1

- Marketplace icon at `media/icon.png`.
- Get started points at the VS Code Marketplace listing (`t04dJ14n9.lumiere`)
  and Extensions search, instead of a VSIX-only install.

## Unreleased

- **Lumière desktop (preview)**: Lumière's editor in a window of its own, in
  the spirit of Typora (`apps/desktop`, Tauri), laid out as VS Code: the
  vault's files on the left, the note's outline on the right, notes in tabs.
  Settings opens as a tab (⌘,), with search, as VS Code's Settings editor.
  Color Theme follows the system or stays light or dark. ⌘B and ⌥⌘B hide
  the files and the outline. Open Folder… uses the native picker, and
  Markdown files open from Finder or the command line. Unsaved notes are written when you quit. The same window
  also runs in a browser (`packages/app`). PDFs do not open there yet.
- **DeepSeek Harness**: Obsidian settings in `.obsidian/app.json` now apply,
  including when the folder is created after the vault opens.
- Fixed outside VS Code: the host could not stop while a note's page was
  open.

- **Toggle Text Editor** (Ctrl/Cmd+E): after switching Lumière ↔ the host text
  editor, close the leave-behind sibling tab of the same file so only one tab
  remains (BH-011 / BH-003). Dirty tabs are left alone.
- **DeepSeek Harness**: Lumière's Markdown editor runs in DeepSeek Harness
  0.2.1 or later, as a DSH plugin (`packages/dsh`): notes open in Lumière in
  DSH's preview sidebar and save as you type. Paths that leave the workspace,
  including through `..` or a symbolic link, are refused. PDFs, Git features
  and the side views stay VS Code and Cursor only for now.
- Fixed: Current-line authorship (gitBlame) could throw "Disposed: gitBlame
  is stopped" into the editor while the plugin restarted.

- **Toggle Text Editor** (Ctrl/Cmd+E): switch the active Markdown note between
  Lumière and the host's built-in text editor. Deliberately not Obsidian's
  Live Preview ↔ Source binding; that remains the unbound Toggle Live
  Preview/Source Mode command. Selection/caret are not restored across the
  switch.

- Renamed to **Lumière: Markdown Editor and PDF Reader**, extension ID
  `t04dj14n9.lumiere`. Settings, commands, views, context keys and editors
  move from `markdownWorkshop.*` and `pdfWorkshop.*` to `lumiere.markdown.*`
  and `lumiere.pdf.*`; the Markdown editor is shown as "Lumière", the PDF
  reader as "Lumière PDF", and the output channel is "Lumière". Settings under
  the old names are not carried over: set them again under the new ones, and
  uninstall `t04dj14n9.vscode-workshop`, which would claim the same files.
  The IDE context packet keeps its `product` values (`markdownWorkshop`,
  `pdfWorkshop`), so agents that read it need no change.
- Open Settings and Change Setting no longer freeze Cursor's window for 15
  to 75 seconds (Markdown and PDF). The Settings editor is opened without
  sending it back to the extension.
- Markdown Workshop and PDF Workshop ship as one extension, `t04dj14n9.vscode-workshop`,
  with custom editors for both `.md` and `.pdf` files. Their histories are in
  `packages/markdown/CHANGELOG.md` and `packages/pdf/CHANGELOG.md`.
- Every plugin runs on `@workshop/core`, built on Cordis; the previous
  in-house kernel, the PDF plugin runtime and its Cordis shim are gone, as is
  the `pdfWorkshop.runtimeImpl` setting.
- One output channel, "Workshop", for both products.
