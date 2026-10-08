# Links

Renders and follows wikilinks and Markdown links, with local heading/block
navigation and side opens, like Obsidian's internal links.

## How it works

The webview decorates wikilinks, distinguishes source clicks from rendered clicks
and selection gestures, and routes commands through a shared opener. Local
fragments navigate with metadata; other requests cross a validated RPC channel.
The host authorizes embedded source identities, offers links to host plugins,
then applies scheme policy or resolves through the vault/native adapter.
Registrations and initial-navigation replies belong to the plugin lifetime.

## Files

- `manifest.ts`: link settings and insert/follow/side command contributions.
- `api.ts`: typed link claim events.
- `protocol.ts`: initial/open/navigation request and notification schemas.
- `target.ts`: scheme detection and link path/fragment parsing.
- `host.ts`: initial navigation, source authorization and default opening policy.
- `webview.ts`: caret lookup, decoration, click handling, navigation and commands.
- `links.test.ts`: target parsing and caret lookup units.
- `host.test.ts`: source identity, scheme policy, side opens and handler lifecycle.

## Services, events and settings

Webview injects `editor`, `livePreview`, `commands` and `rpc`; host injects `rpc`,
`workbench`, `vault` and `resources`. Provides no service. Queries `link/click`
and `links/open` with bail semantics. Settings: plugin enabled (true),
`links.newLinkFormat` (shortest), `links.useWikilinks` (true), `links.folderNote`
(empty), and native `files.newNoteFolder` for creation. No default command keys.

## Limits and differences from Obsidian

The native adapter rechecks containment and symlinks before opening or creating.
External application schemes ask first; script, data, command and file schemes
are refused. Unresolved wikilinks can create notes; dedicated unresolved styling
is not provided by this module. Host claim handlers may override default opening.
