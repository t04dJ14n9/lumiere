# IDE context packet (v1)

The packet both Markdown Workshop and PDF Workshop build (`src/ide-context`).

## Discriminant

- `product: "markdownWorkshop"` ⇒ `markdown` required; `pdf` forbidden
- `product: "pdfWorkshop"` ⇒ `pdf` required (incl. `pdf.selection`); `markdown` forbidden; `active.uri === pdf.uri`

## Pipeline

`scrubPacket` → `truncatePacket` → `renderMarkdown` / `serializeJson`

## Dual caps

- Clipboard markdown ≤ `maxClipboardChars` (32_000)
- JSON ≤ `maxJsonChars` (64_000)

Field-level truncate before encode; never slice final JSON.

## Shared module

Keep `src/shared/ide-context/**` byte-identical across both repos. SHA-256 pins live in twin unit tests.
