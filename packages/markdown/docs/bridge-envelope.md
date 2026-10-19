# Bridge envelope

Lumière and Agent PDF Viewer are separate extensions. They can
hand a selection to an agent as the same JSON object. This file is the
contract. The clipboard text in
[agent-handoff-format.md](agent-handoff-format.md) is unchanged and is not
this object.

The envelope is a **workbench protocol**. It is not OKF metadata, not a
wiki page, and not a shared Back/Forward history. Neither extension runs
an agent because an envelope was built.

## Commands

| Command | Who publishes it | When it is absent |
| --- | --- | --- |
| `lumiere.markdown.bridge.envelope` | Lumière, hidden from the palette | This extension is disabled or not installed |
| `vscodeEmbedPdf.bridge.envelope` | Agent PDF Viewer | This extension does not call it, and does not require that extension |

`lumiere.markdown.bridge.envelope` returns one envelope for the active
Markdown selection, or asks the PDF command when this editor has no
selection. An optional argument is a wiki context (`preset`, `bundle`,
`collection`, `type`). A malformed argument is ignored. The command does
not open a chat.

Lumière calls `vscodeEmbedPdf.bridge.envelope` only when
`agentEnvironment().commands` contains that id. If the command is missing,
or the call throws, the result is empty.

## Version 1

```json
{
  "version": 1,
  "producer": "markdown",
  "capturedAt": "2026-10-11T12:00:00.000Z",
  "source": {
    "identity": "notes/a.md",
    "kind": "file",
    "media": "markdown",
    "publishedAt": "2020-01-02T03:04:05Z",
    "title": "Attention"
  },
  "locator": {
    "durable": "@notes/a.md#3-5",
    "markdown": { "startLine": 3, "endLine": 5 }
  },
  "view": { "id": "panel-1" },
  "selection": { "text": "Selected", "sha256": "<64 hex>" },
  "revision": {
    "documentVersion": 4,
    "sourceSha256": "<64 hex>",
    "isDirty": false
  },
  "wiki": {
    "preset": "slim",
    "bundle": "knowledge",
    "collection": "$concepts",
    "type": "Concept"
  }
}
```

`producer` is `markdown` or `pdf`. `source.kind` is `file`, `untitled` or
`remote`. `source.media` is `markdown`, `pdf` or `other`.

Unknown `version` values fail closed (`unsupported-version`). Unknown
top-level fields are kept on `extra` so either extension can round-trip
them. Unknown nested fields are dropped.

## What is not the same thing

| Field | Means | Does not mean |
| --- | --- | --- |
| `locator.durable` | Reopens the spot after the view is gone. Markdown uses the LLM Wiki `@path#lines` form. PDF uses `path#page=N&viewrect=x,y,width,height`. | A panel id |
| `view.id` | The live editor panel. Required for an untitled note, which has no durable locator. | A path. It must not equal `locator.durable` |
| `capturedAt` | When this selection was taken, ISO-8601 | When the source was published |
| `source.publishedAt` | Frontmatter `published`, `date`, `captured` or `last_modified` | `generated.at`, and not `capturedAt` |
| `selection.sha256` | Hash of the selected text. 16 to 64 hex digits, stored lowercase | A hash of the file |
| `revision.sourceSha256` | Hash of the whole saved source | Present while `revision.isDirty` is true, or for an untitled note |
| `wiki` | Optional context from the workbench wiki plugin | OKF frontmatter. Either side may omit it |

A saved file envelope includes `revision.sourceSha256`. A dirty file keeps
`locator.durable` and sets `revision.isDirty`, and omits the whole-source
hash, because the hash would not match disk. Clipboard `@path` text is
produced only for a saved file, so the line numbers match disk.

Hashes are SHA-256 of the UTF-8 text when this extension produces them
(`Workshop.fingerprint`). The shared handoff fixture's PDF prefix
`9f86d081884c7d65` is accepted.

## PDF locator

A PDF durable locator is the Source link target already copied by Agent
PDF Viewer:

```text
papers/attention.pdf#page=3&viewrect=72,83,134,21
```

`viewrect` is `x,y,width,height` in PDF points. Page navigation inside
Agent PDF Viewer is not this envelope and is not a shared history stack.

## Wiki layout the envelope can name

The wiki plugin reads `.wiki/layout.json` (schema 1). A missing file is
the legacy preset and does not invent collection directories. A file that
does not parse is reported and is not treated as legacy. Unknown keys such
as `code` and `descriptions` are ignored.

```json
{
  "schema": 1,
  "preset": "slim",
  "bundle": "knowledge",
  "assets": "assets",
  "inbox": "inbox",
  "exports": "exports",
  "dirs": {
    "concepts": "concept",
    "summaries": "summary",
    "entities": "entity",
    "raw": "raw"
  }
}
```

`wiki.collection` uses the logical name (`$concepts`). The workbench does
not create those folders.

## Left for the other extensions

- **Agent PDF Viewer** can publish `vscodeEmbedPdf.bridge.envelope`
  returning this version-1 object (`producer: "pdf"`), and can call
  `lumiere.markdown.bridge.envelope` for a note. It should keep its
  current Source-link clipboard text. Do not merge the PDF extension into
  this repository.
- **Browser Bridge** stays a Chrome-owned extension. It is not implemented
  here and does not share this process's navigation history.
- Cross-extension Back/Forward is not part of this envelope.
