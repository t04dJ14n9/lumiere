# Bridge envelope

Lumière and Lumière PDF stay separate extensions. Each
publishes a command that returns the user's current selection as one
versioned envelope. This is not the Copy Link for Agent clipboard text
(`docs/agent-handoff-format.md` is unchanged).

| Command | Producer |
| --- | --- |
| `vscodeEmbedPdf.bridge.envelope` | `"pdf"` |
| `lumiere.markdown.bridge.envelope` | `"markdown"` |

The PDF command keeps its `vscodeEmbedPdf.bridge.envelope` id across the PDF
Workshop rename so existing peer integrations can discover it.

Version is `1`. The object matches Lumière's Workbench v1
`BridgeEnvelope` so Workshop's `parseBridgeEnvelope` accepts a PDF result.

Workshop is the aggregator: it returns a Markdown selection when the active
editor has one, otherwise it calls this command when the command is
registered. This command does **not** call Workshop back (and does not
accept an `includePeers` flag), so the two cannot recurse. A missing
command or a failing peer on the Workshop side leaves that call empty.

No PDF selection returns `undefined`. The command does not write the clipboard.

## PDF envelope

```json
{
  "version": 1,
  "producer": "pdf",
  "capturedAt": "2026-10-11T12:00:00.000Z",
  "source": {
    "identity": "papers/attention.pdf",
    "kind": "file",
    "media": "pdf"
  },
  "locator": {
    "durable": "file:///work/papers/attention.pdf#page=3&viewrect=72,83,134,21",
    "pdf": {
      "page": 3,
      "viewRect": { "x": 72, "y": 83, "width": 134, "height": 21 }
    }
  },
  "view": { "id": "pdf:<uuid>" },
  "selection": {
    "text": "Scaled dot-product attention",
    "sha256": "<sha256 of the selection only>"
  },
  "revision": {
    "sourceSha256": "<sha256 of the whole PDF>",
    "isDirty": false
  }
}
```

A region uses the same locator shape. A selection across pages uses the
first page for `locator` (Workbench v1 carries one locator). The selection
hash covers kind, text, and every page rectangle
(`selectionCanonical`).

| Field | What it is | What it is not |
| --- | --- | --- |
| `source.identity` | Source path (workspace-relative when possible) | A pane id |
| `revision.sourceSha256` | Hash of the whole PDF bytes | Hash of the selection |
| `selection.sha256` | Hash of the selection (kind, text, page rectangles) | Hash of the file |
| `locator.durable` | Durable reopen link (URI-safe base + `#page=` / `viewrect`, RFC 8118); not the human `source.identity` when the path contains `#` | A view id |
| `view.id` | Temporary id of this pane; dies with the pane | A path or a locator |
| `capturedAt` | When the user made the selection | Source publication time |

The same PDF can be open in two panes. Each pane has its own `view.id` and
its own selection. `locator.durable` is built from a URI-safe base
(`panel.uri.toString()`: `file:…` / remote URI, including any `?query`, with
`#` in the filename already percent-encoded) plus
`#page=N&viewrect=left,top,width,height` in PDF points from the page's
top-left corner, the same fragment Open Location already accepts. Raw
relative paths still encode `#` / `?` before the fragment is appended.
`source.identity` stays the human/relative path. Structured
`locator.pdf.viewRect` uses `{ x, y, width, height }` for the same box.

## Not owned here

Browser Bridge (Chrome) is a different producer. This extension does not
publish browser selections, DOM ranges, or browser view ids. A shared
package for the three producers is not part of this extension; the command
and this document are the PDF side of the contract.
