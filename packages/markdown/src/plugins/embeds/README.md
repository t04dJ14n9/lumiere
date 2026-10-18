# Embeds

Transcludes notes, headings and block IDs and displays images, audio and video,
like Obsidian's embeds. PDFs and other attachments appear as cards that open files.

## How it works

Inline/block renderers use shared rendering, then each embed pass resolves its
placeholders through Resources. Note renders retain the native source identity,
full text and line offsets for links/tasks/footnotes. Media controls, image dialogs,
recovery streams and nested passes are disposed when the owning pass or plugin
stops. Original placeholders are restored and late resource results are ignored.

As in Obsidian 1.13 and later, a click on an image selects it: it stays
rendered, outlined, with the caret at the embed's start. Then `+` and `-`
resize it in steps of 25 pixels, from the width it shows, up to the width of
the note's text (written as `![[a.png|100]]`, or in a Markdown image's alt
text, `![100](a.png)`); `0` removes the size; Enter selects the file name;
Tab puts the caret where the size is written; Backspace or Delete removes
the embed; Escape, a click elsewhere or any edit lets it go
(`image-selection.ts`, `image-size.ts`).

## Files

- `manifest.ts`: enablement and Insert Embed contribution.
- `webview.ts`: renderer, post-processor and command registrations.
- `post-process.ts`: resource resolution, per-kind display and pass lifetime.
- `note.ts`: note/heading/block selection, ancestry and source-line mapping.
- `image.ts`: zoom toolbar, fit/actual sizing, pan and resize controls.
- `image-selection.ts`: selecting an image by a click, and its keys.
- `image-size.ts`: an image's written size and the resize steps.
- `image-dialog.ts`: inspector dialog, remembered scale and focus lifetime.
- `webm.ts`: WebM parsing/recovery exports.
- `webm-stream.ts`: EBML metadata, streaming boundaries and block time ordering.
- `media-recovery.ts`: recovery fetch, header identification and streaming lifetime.
- `media-source.ts`: MediaSource opening, append cleanup and Opus-preroll start.
- `note.test.ts`: fragment, source-offset and circular-embed units.
- `image.test.ts`: saved-scale validation and legacy state units.
- `webm.test.ts`: real codec fixtures, stream ordering and invalid/truncated data.
- `embeds.css`: embeds and the image inspector, bundled through
  `src/webview/styles/index.css`.

## Services, events and settings

Injects `editor`, `commands`, `livePreview`, `render`, `resources` and `rpc`;
provides no services. Listens to `render/postProcess`; no kernel events emitted.
Uses Links RPC to open an embedded target. `markdownWorkshop.plugins.embeds.enabled`
defaults to true. Insert Embed has no default keybinding. Remote media follows
workspace trust from Render.

## Limits and differences from Obsidian

Cycles and ancestry depth of twelve are refused. Local files remain host-contained;
remote media requires a trusted workspace. PDF embeds open cards rather than an
inline PDF viewer; a card opens the PDF in PDF Workshop at the embed's page. WebM recovery supports VP8/VP9 and Opus/Vorbis when the host
MediaSource supports them. Visual and playback parity await owner comparison.
