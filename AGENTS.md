# Agent instructions

A VS Code extension that edits Markdown like Obsidian's Live Preview, built so
that everything is a plugin. Read [DESIGN.md](DESIGN.md) and
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) before changing code.

## Rules

- `src/kernel`, `src/shared` and `src/markdown` must run anywhere: no DOM,
  VS Code or Node APIs. The tsconfig projects enforce this.
- Every capability is a plugin under `src/plugins/<id>/`. Reach other
  capabilities through injected services and typed events, never by importing
  another plugin's internals. Register side effects through the plugin's
  context so they are undone when it stops.
- The `TextDocument` owns text, saving and undo. Webviews only synchronize.
- The webview is untrusted. Every message has a schema and is validated in
  both directions; the host re-checks paths and containment.
- Track editors per panel, never by file path: one note can be open twice.
- Keep the Copy for Agent wording compatible with LLM Wiki
  (`@path#start-end`).
- Obsidian is a behaviour reference only. Never copy its code, CSS or assets.
  Compare in a disposable vault, never the owner's.
- Read the source from `~/Code/human-learning` at commit `ff3a902e`; never
  modify that repository or its worktrees.
- Every source test is ported, rewritten or retired with a reason in
  `docs/TEST_LEDGER.md`.

## Checks

Run before committing, in this order:

```sh
pnpm check
pnpm test:browser
pnpm test:vscode   # opens a VS Code window
```

Commit at the end of each phase with its record in IMPLEMENTATION_PLAN.md.
Do not push or publish to the Marketplace without the owner's approval.
