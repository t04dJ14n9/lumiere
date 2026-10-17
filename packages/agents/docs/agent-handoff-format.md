# Agent handoff format

Markdown Workshop and PDF Workshop both hand a selection to an agent with
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
- Markdown Workshop saves the note first, so the lines are those on disk.
  PDF Workshop's MCP tool `get_current_note_selection` returns the same text for a
  note open in Markdown Workshop; for an unsaved note, which has no stable
  line numbers, its reference reads `notes/a.md (unsaved, lines 12-18)`.

## PDF selections (PDF Workshop)

```text
Source: [papers/attention.pdf (page 3)](<papers/attention.pdf#page=3&viewrect=72,83,134,21>)
PDF source SHA-256: `9f86d0…`

Selected text:
Scaled dot-product attention

When you answer, cite the Source link above so the reader can reopen this spot in the PDF.
```

- One `Source:` link per selection, or `Sources:` with one `- ` link per
  page; the link opens the page and box (`viewrect=x,y,width,height` in PDF
  points).
- The SHA-256 lets an agent tell whether the file changed.
- A region replaces `Selected text:` with an instruction to read or render
  the box, the snapshot's path (`Region image: …`) when one was saved, and the
  text found inside the box.
- The closing line asks the agent to cite the link, which PDF: Open
  Location reopens.

## Changing the format

Change the fixture and this file in both repositories in the same change
set, update both formatters, and update the pinned hash in both tests.
