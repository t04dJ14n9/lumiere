# Attachments

Obsidian-style attachment saving: drop or paste an image (including clipboard
screenshots and images in rich HTML paste) into a note → the file lands in
`files.attachmentFolder` under a `YYYY-MM-DD HH.mm.ext` name → the note gets a
relative Markdown or WikiLink embed from the Links settings.

## How it works

Shared helpers in `src/attachments/` resolve the folder, pick a unique
timestamp name, write bytes, and build the embed. The host half answers each
note page's `save` RPC. The webview half handles drag-and-drop, binary image
paste, and rewrites remote / data-URI images after HTML→Markdown paste.

Sketch placement uses the same shared helpers, so sketches and pasted images
share one folder and link story.

## Files

- `manifest.ts`: feature switch.
- `protocol.ts`: webview → host `save` request.
- `host.ts`: write into the vault; bind each open note page.
- `webview.ts`: DnD, clipboard image paste, HTML image rewrite.

## Settings

Folder: `files.attachmentFolder` (Links). Links: `links.useWikilinks` and
`links.newLinkFormat`. No filename-template setting in v1.

## Limits

A failed save leaves that item unchanged and shows a short error; no broken
vault link is inserted. Other items in a multi-drop may still succeed.
