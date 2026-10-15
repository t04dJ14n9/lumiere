# Embeds

Transcludes notes, headings and block IDs and displays images, audio and video,
like Obsidian's embeds. PDFs and other attachments appear as cards that open files.

## How it works

Inline/block renderers use shared rendering, then each embed pass resolves its
placeholders through Resources. Note renders retain the native source identity,
full text and line offsets for links/tasks/footnotes. Media controls, image dialogs,
recovery streams and nested passes are disposed when the owning pass or plugin
stops. Original placeholders are restored and late resource results are ignored.

## Files

- `manifest.ts`: enablement and Insert Embed contribution.
- `webview.ts`: renderer, post-processor and command registrations.
- `post-process.ts`: resource resolution, per-kind display and pass lifetime.
- `note.ts`: note/heading/block selection, ancestry and source-line mapping.
- `image.ts`: zoom toolbar, fit/actual sizing, pan and resize controls.
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
inline PDF viewer. WebM recovery supports VP8/VP9 and Opus/Vorbis when the host
MediaSource supports them. Visual and playback parity await owner comparison.
