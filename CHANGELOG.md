# Changelog

## Unreleased

- Markdown Workshop and PDF Workshop ship as one extension, `t04dj14n9.vscode-workshop`,
  with custom editors for both `.md` and `.pdf` files. Their histories are in
  `packages/markdown/CHANGELOG.md` and `packages/pdf/CHANGELOG.md`.
- Every plugin runs on `@workshop/core`, built on Cordis; the previous
  in-house kernel, the PDF plugin runtime and its Cordis shim are gone, as is
  the `pdfWorkshop.runtimeImpl` setting.
- One output channel, "Workshop", for both products.
