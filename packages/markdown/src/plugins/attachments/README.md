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
tab when the webview actually receives the event (OS drops; Explorer drops
while holding Shift). Explorer drops that only carry URIs are imported on the
host; OS `File` drops are read in the webview. Remote HTML images are
downloaded on the host because the editor CSP `connect-src` does not allow
`https:`.

### Explorer without Shift

VS Code disables pointer events on custom-editor webviews while Explorer
resources are dragged unless Shift is held, so the workbench opens the file as
a preview tab instead of delivering `drop` to the page. The host watches those
preview media tab opens: when the prior active editor in that column was a
Lumière note that is still open, it closes the media tab, copies the file into
`files.attachmentFolder` under a timestamp name, and inserts the embed into the
note.

Sketch placement uses the same shared helpers, so sketches and pasted images
share one folder and link story.

## Files

- `manifest.ts`: feature switch.
- `protocol.ts`: webview → host `save` / `importUrl` requests.
- `host.ts`: write into the vault; bind each open note page; reclaim Explorer
  open-on-drop tabs.
- `webview.ts`: DnD, clipboard image paste, HTML image rewrite.

## Settings

Folder: `files.attachmentFolder` (Links). Links: `links.useWikilinks` and
`links.newLinkFormat`. No filename-template setting in v1.

## Limits

A failed save leaves that item unchanged and shows a short error; no broken
vault link is inserted. Other items in a multi-drop may still succeed.

Single-click opening a preview media file while a Lumière note is focused in
the same group can look like Explorer drop-without-Shift and may be reclaimed
as an attachment; double-click (permanent tab) or open-to-the-side is left alone.
