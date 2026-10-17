# IDE Context (plugin id `ideContext`)

Clipboard-first deeper IDE context for Claude Code and Codex.

- **Copy IDE Context** — gather → scrub → truncate → markdown → clipboard. Never opens an agent.
- **Send IDE Context to Agent…** — same packet; opens an agent only via forced `copyLinkForAgent.target`, sole-agent `auto`, or an explicit QuickPick (`Claude Code | Codex | Copy only`). Never silent-guesses Claude vs Codex.

Leaves `cursorBridge` alone. No `copyJsonPath` in v1. Shared core: `@workshop/agents/ide-context` (`packages/agents`), used by PDF Workshop too.
