# @workshop/agents

What Lumière and Lumière PDF hand to coding agents (Claude Code,
Codex, Cursor, VS Code chat), defined once for both:

- `src/handoff.ts`: the note reference and quoted payload Copy Link for Agent
  writes (`@notes/a.md#12-18`), per [docs/agent-handoff-format.md](docs/agent-handoff-format.md).
- `src/ide-context/`: the IDE context packet (active note or PDF, selection,
  open tabs, diagnostics): gathered, scrubbed, truncated and rendered, per
  [docs/ide-context-packet.md](docs/ide-context-packet.md).

Pure TypeScript: no DOM, VS Code or Node APIs (the products pass their host
APIs in). `test/fixtures` holds the contract fixtures both products test
against; `@workshop/agents/testing` exports an in-memory file system for
tests of the temp-file publishing.
