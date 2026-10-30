# Attachments

Obsidian-style attachment saving: drop or paste an image (including clipboard
screenshots and images in rich HTML paste) into a note → the file lands in
`files.attachmentFolder` under a `YYYY-MM-DD HH.mm.ext` name → the note gets a
relative Markdown or WikiLink embed from the Links settings.

## How it works

Shared helpers in `src/attachments/` resolve the folder, pick a unique
timestamp name, write bytes, and build the embed. The host half answers each
note page's `save` (bytes) and `importUrl` (http(s) / file://) RPCs. The
webview half handles drag-and-drop, binary image paste, and rewrites remote /
data-URI images after HTML→Markdown paste.

Drag-and-drop listens on the webview document (capture) and always
`preventDefault`s file / uri-list drags so VS Code does not open the drop as a
tab. Explorer drops that only carry URIs are imported on the host; OS `File`
drops are read in the webview. Remote HTML images are downloaded on the host
because the editor CSP `connect-src` does not allow `https:`.

Sketch placement uses the same shared helpers, so sketches and pasted images
share one folder and link story.

## Files

- `manifest.ts`: feature switch.
- `protocol.ts`: webview → host `save` / `importUrl` requests.
- `host.ts`: write into the vault; bind each open note page.
- `webview.ts`: DnD, clipboard image paste, HTML image rewrite.

## Settings

Folder: `files.attachmentFolder` (Links). Links: `links.useWikilinks` and
`links.newLinkFormat`. No filename-template setting in v1.

## Limits

A failed save leaves that item unchanged and shows a short error; no broken
vault link is inserted. Other items in a multi-drop may still succeed.
