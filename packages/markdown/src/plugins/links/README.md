# Links

Renders and follows wikilinks and Markdown links, with local heading/block
navigation and side opens, like Obsidian's internal links. Wikilinks to notes
that do not exist yet are dimmed with a dotted underline. Links to PDFs
(`[[paper.pdf#page=3]]`, `[text](paper.pdf#page=3&viewrect=…)`) open in PDF
Workshop at that page and box, through its Open Location command.

## How it works

The webview decorates wikilinks, distinguishes source clicks from rendered clicks
and selection gestures, and routes commands through a shared opener. Local
fragments navigate with metadata; other requests cross a validated RPC channel.
The host authorizes embedded source identities, offers links to host plugins,
then applies scheme policy or resolves through the vault/native adapter.
Native opening binds a panel ID before waiting for the links plugin. Each
webview registers a fresh session; requests are acknowledged after layout and
cancelled on newer navigation, reload or disposal. No URI-keyed pending reveal
survives successful delivery. Missing fragments show a message without moving
the caret or treating the existing note as missing.

The window half also supplies exact href ranges for precise local inline links
in VS Code's built-in Markdown editor. A signed source/version ticket checks the
clicked text, workspace containment and source group before native `openWith`.
The normal document-link provider takes precedence over overlapping built-in
links. VS Code's separate definition gesture may open the same target first;
that matching transition is allowed while unrelated departures, source edits and
caret movement away from the href cancel delivery. Native cross-file Back keeps
the source location; the destination's precise-jump history remains per pane.

For unresolved styling the host reads the note's `unresolvedLinks` from the
vault index. The webview asks for that set once when it starts, and the host
sends it again whenever the vault re-resolves links and the set has changed,
for example after the target note is created or the user types a new link.
The webview keeps the set in a CodeMirror state field, and the wikilink
renderer adds `is-unresolved` to rendered links whose path is in it.

## Files

- `suggestions.ts`: plugin-owned completion trigger through `suggest/trigger`.

- `native-host.ts`: window-scoped native link registration through the host services `dialogs`, `settings` and `navigation`.
- `manifest.ts`: link settings and insert/follow/side command contributions.
- `api.ts`: typed link claim events.
- `protocol.ts`: session readiness, acknowledged navigation, missing-fragment,
  open and unresolved-link schemas.
- `target.ts`: scheme detection, link path/fragment parsing and unresolved keys.
- `navigation-host.ts`: per-panel readiness, session identity and cancellation.
- `host.ts`: unresolved sets, source authorization and
  default opening policy.
- `caret-link.ts`: source caret lookup and focus-guarded link following for any editor.
- `webview.ts`: decoration (including unresolved styling), click
  handling, navigation and commands.
- `links.test.ts`: target parsing and caret lookup units.
- `host.test.ts`: source identity, scheme policy, side opens and handler lifecycle.
- `test/unit/links/unresolved.test.ts`: unresolved keys, styled decorations and
  the host's set updates.
- `links.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Listens to `suggest/trigger` for its own completion syntax.

Webview injects `editor`, `livePreview`, `commands` and `rpc`; host injects `rpc`,
the host services `dialogs`, `settings` and `navigation`, `vault` and `resources`. Webview provides `links` for focused-editor
caret following; host provides no service. Queries `link/click`
and `links/open` with bail semantics. Settings: plugin enabled (true),
`links.newLinkFormat` (shortest), `links.useWikilinks` (true), `links.folderNote`
(empty), and native `files.newNoteFolder` for creation. The editor binds Mod+Enter to follow the caret link.

## Limits and differences from Obsidian

The native adapter rechecks containment and symlinks before opening or creating.
External application schemes ask first; script, data, command and file schemes
are refused. Unresolved wikilinks can create notes. Unresolved styling applies to wikilinks in Live Preview while they are
rendered, and to wiki / Markdown / embed link source in source mode. Markdown
links in Live Preview and links inside embedded notes are not styled yet. A link typed just
now is dimmed optimistically when its target is not among the vault's known
note keys; the open-note overlay re-index still refreshes the authoritative
unresolved set shortly after. Host claim handlers may override default opening.

File-location fields are validated by this plugin's schema and exposed as
`files.newNoteFolder` and `files.attachmentFolder`. The native note-creation
pipeline consumes the former; attachment importing is outside this release.
`useWikilinks` controls suggestion acceptance; explicit Insert Wikilink retains
wiki syntax. New-link format still controls vault link text.

A reused side-open destination must be unambiguous among same-note panes;
otherwise navigation fails clearly rather than choosing another pane. Ordinary
local jumps also participate in the editor's per-pane precise-jump history.

Native integration currently covers inline `.md`/`.markdown` links with heading
or block fragments in local workspace Markdown files. Reference-style links,
remote files, external links and native line/column fragments keep the built-in
route. Command links do not receive VS Code's side-open modifier context; this
route uses the source group. A manual switch to the exact expected target cannot
be distinguished from the built-in definition gesture through the public API.

Command+Enter on macOS (Ctrl+Enter elsewhere) follows a link at the caret
through the same navigation and trust checks as clicking it. It only handles
a collapsed caret in the Markdown editor, leaving property inputs, dialogs
and unlinked text to their existing handlers. Bare URLs and autolinks work too.
The injected `links.follow(view)` service lets table cell editors use the same
open path with their own text and caret. Each editor keeps its contentDOM focus
guard; focusing a cell never follows a link at the outer editor's caret.
