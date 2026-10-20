# Changelog

## 0.1.1

- Marketplace icon at `media/icon.png`.
- Get started points at the VS Code Marketplace listing (`t04dJ14n9.lumiere`)
  and Extensions search, instead of a VSIX-only install.

## Unreleased

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
