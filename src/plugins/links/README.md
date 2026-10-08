# Links

Renders and follows wikilinks and Markdown links, with local heading/block
navigation and side opens, like Obsidian's internal links. Wikilinks to notes
that do not exist yet are dimmed with a dotted underline.

## How it works

The webview decorates wikilinks, distinguishes source clicks from rendered clicks
and selection gestures, and routes commands through a shared opener. Local
fragments navigate with metadata; other requests cross a validated RPC channel.
The host authorizes embedded source identities, offers links to host plugins,
then applies scheme policy or resolves through the vault/native adapter.
Registrations and initial-navigation replies belong to the plugin lifetime.

For unresolved styling the host reads the note's `unresolvedLinks` from the
vault index. The webview asks for that set once when it starts, and the host
sends it again whenever the vault re-resolves links and the set has changed,
for example after the target note is created or the user types a new link.
The webview keeps the set in a CodeMirror state field, and the wikilink
renderer adds `is-unresolved` to rendered links whose path is in it.

## Files

- `manifest.ts`: link settings and insert/follow/side command contributions.
- `api.ts`: typed link claim events.
- `protocol.ts`: initial/open/unresolved request and navigation/unresolved
  notification schemas.
- `target.ts`: scheme detection, link path/fragment parsing and unresolved keys.
- `host.ts`: initial navigation, unresolved sets, source authorization and
  default opening policy.
- `webview.ts`: caret lookup, decoration (including unresolved styling), click
  handling, navigation and commands.
- `links.test.ts`: target parsing and caret lookup units.
- `host.test.ts`: source identity, scheme policy, side opens and handler lifecycle.
- `test/unit/links/unresolved.test.ts`: unresolved keys, styled decorations and
  the host's set updates.

## Services, events and settings

Webview injects `editor`, `livePreview`, `commands` and `rpc`; host injects `rpc`,
`workbench`, `vault` and `resources`. Provides no service. Queries `link/click`
and `links/open` with bail semantics. Settings: plugin enabled (true),
`links.newLinkFormat` (shortest), `links.useWikilinks` (true), `links.folderNote`
(empty), and native `files.newNoteFolder` for creation. No default command keys.

## Limits and differences from Obsidian

The native adapter rechecks containment and symlinks before opening or creating.
External application schemes ask first; script, data, command and file schemes
are refused. Unresolved wikilinks can create notes. Unresolved styling applies to
wikilinks in Live Preview while they are rendered; Markdown links, links in
source mode and links inside embedded notes are not styled. A link typed just
now looks resolved until the vault re-indexes the note (300 ms debounce). Host claim handlers may override default opening.
