# Agent handoff format

Lumière and Lumière PDF both hand a selection to an agent with
**Copy Link for Agent**, and agents (and skills written for them) should read
one format. This file and `test/fixtures/agent-handoff-format.json` define it
once, for both products; each product's unit tests check its formatter
against the fixture.

Names are the same in both extensions: the plugin is `agentBridge`, the
service that builds and hands over the text is `AgentHandoff`, and the
command is `copyLinkForAgent`. The text is agent-agnostic: plain text with
raw links, never a chat-specific mention syntax.

## Note selections (Markdown)

```text
@notes/a.md#12-18

> First selected line
>
> Third selected line
```

- The reference is `@` + path + `#` + line range; one line is `#12`.
- The path is relative to the only local workspace folder; in multi-root
  and remote workspaces it is the note's full URI
  (`@file:///elsewhere/b.md#1-2`).
- After a blank line comes the selection, every line quoted with `> `
  (an empty line is a bare `>`), line endings normalised to `\n` and
  trailing newlines dropped.
- Lumière saves the note first, so the lines are those on disk.
  Lumière PDF's MCP tool `get_current_note_selection` returns the same text for a
  note open in Lumière; for an unsaved note, which has no stable
  line numbers, its reference reads `notes/a.md (unsaved, lines 12-18)`.

## PDF selections (Lumière PDF)

```text
[attention.pdf · p.3](papers/attention.pdf#page=3&viewrect=72,83,134,21)

> Scaled dot-product attention
```

- One Markdown link per selected page: label is `basename · p.N` (no
  escapes), href is only `path#page=N&viewrect=x,y,w,h` (RFC 8118; no
  angle brackets around the href).
- After a blank line, the selected text is quoted with `> ` (same rules as
  note payloads). A region with no readable text is link-only.
- No `Source:` / `Sources:` prefix, no PDF SHA-256 line, no cite
  instruction, and no region-image path on the clipboard. File revision
  hashing remains on the structured bridge envelope / MCP side when needed.
- In the UI, Copy Link for Agent is only on the PDF webview context menu.

## Changing the format

Change the fixture and this file in both repositories in the same change
set, update both formatters, and update the pinned hash in both tests.
