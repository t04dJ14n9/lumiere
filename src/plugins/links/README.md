# Links

Owns wikilink decorations, rendered/source click rules, link commands and the
validated `links` channel. Injects editor, livePreview, commands and RPC in the
webview; vault, workbench and RPC in the host. All registrations are fiber-owned.
`links/open` lets host plugins claim a link before default navigation.

The native adapter rechecks vault containment and symlinks before opening or
creating a note. Application schemes ask first; script, data, command and file
schemes are refused. Local fragments use the shared metadata parser. New notes
use `files.newNoteFolder`. Resolution currently uses the Phase 3 vault snapshot;
index-backed unresolved styling and link-format consumers arrive in Phase 5.
