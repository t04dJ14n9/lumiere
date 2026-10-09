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
- Keep the Ask Agent reference wording compatible with LLM Wiki
  (`@path#start-end`).
- Obsidian is a behaviour reference only. Never copy its code, CSS or assets.
  Compare in a disposable vault, never the owner's.
- Read the source from `~/Code/human-learning` at commit `ff3a902e`; never
  modify that repository or its worktrees.
- Automated tests are unit tests only. Do not port the source's browser or
  native suites; record them as retired in `docs/TEST_LEDGER.md` and cover
  their behaviour in `docs/MANUAL_TEST_PLAN.md`, which the owner runs with
  computer use. See "Testing policy" in IMPLEMENTATION_PLAN.md.

## Code norms

Write for a human reader who knows TypeScript and CodeMirror but not this
code. `pnpm check` enforces the mechanical part:

- Prettier formatting (`pnpm format` fixes it; `.prettierignore` lists what it
  skips).
- Braces on every block and one declaration per statement.
- In `src` (not tests): no nested ternaries; nesting depth at most 4;
  functions at most 60 lines, not counting blank lines and comments;
  cyclomatic complexity at most 15; at most 4 parameters (pass an options
  object instead); files at most 400 lines; no class spread across files
  through `this:` functions attached as fields.

All source meets these limits, and they have no exceptions. When porting a
long source function, rewrite it rather than copying it. Another rule may have
a genuine exception (a type-only declaration merge, an untyped dependency): an
inline `// eslint-disable-next-line <rule> -- <reason>`, added to the reviewed
list in `test/unit/lint-rules.test.ts`. That test fails if the old backlog file
returns, if a limit changes, or if an exception is not on its list.

What the linter cannot check:

- **Split by responsibility, not by length.** A function does the one thing
  its name says. An extracted unit receives only the state it needs, as
  parameters or a narrow interface, never the whole owner object. Moving code
  unchanged into another file to meet a limit is not a fix.
- **A plugin's `apply` reads as a table of contents**: a short sequence of
  named registrations (`registerFoldGutter(ctx, options)`), each defined below
  it or in its own module.
- **Names say what things mean** in the domain (`revealSourceAroundCaret`, not
  `handle` or `run2`). Booleans read as predicates (`isRevealed`,
  `hasFocus`). Avoid abbreviations other than well-known ones (`id`, `url`,
  `rpc`).
- **Prefer early returns** to nested conditions, and narrowing to the non-null
  assertion `!`. Use `!` only where an invariant guarantees the value.
- **Comments explain why**: invariants, ordering constraints, races, browser
  and VS Code workarounds, and anything a reader might otherwise "fix" by
  mistake. Do not narrate what the next line does.
- **Rewrites preserve behaviour.** Never mix a behaviour change into a
  readability commit. If a rewrite exposes a bug, fix it in its own commit
  with a unit test. Extracted pure logic gets unit tests.
- **Plugin READMEs** follow this template and contain no project status
  (status belongs in IMPLEMENTATION_PLAN.md):
  1. What it does, in one or two sentences, in user terms, with the Obsidian
     equivalent.
  2. How it works: the main flow in a short paragraph.
  3. Files: one line per file.
  4. Services injected and provided, events listened to and emitted,
     settings.
  5. Limits and known differences from Obsidian.

## Checks

Run before committing, in this order:

```sh
pnpm check
pnpm test:browser  # small smoke suite
pnpm test:vscode   # one native smoke test; opens a VS Code window; Phase 8 or when native wiring changes
```

Commit at the end of each phase with its record in IMPLEMENTATION_PLAN.md.
Do not push or publish to the Marketplace without the owner's approval.
