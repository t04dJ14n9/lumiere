# Agent instructions

One VS Code and Cursor extension, "Workshop: Markdown and PDF", in a pnpm
workspace. Everything is a plugin:

| Path | What it is | Read first |
| --- | --- | --- |
| `packages/core` | The plugin core on Cordis | its README.md |
| `packages/agents` | What both products hand to agents | its README.md |
| `packages/markdown` | Markdown Workshop: Obsidian-like Live Preview | its DESIGN.md, IMPLEMENTATION_PLAN.md |
| `packages/pdf` | PDF Workshop: EmbedPDF viewer with agent links | its README.md, AGENTS.md |
| `src/extension.ts` | The composition root: one plugin tree for both | |

If the task is a user / third-party custom plugin, read
[packages/markdown/AGENT.md](packages/markdown/AGENT.md) and implement it as a
**separate VS Code extension**, not under `src/plugins/`.

## Rules

- Pure code runs anywhere, with no DOM, VS Code or Node APIs:
  `packages/core/src`, `packages/agents/src`, and `src/shared` and
  `src/markdown` in each product.
  The tsconfig projects and the `architecture/boundaries` lint rule enforce
  this.
- Every capability is a plugin (`packages/markdown/src/plugins/<id>/`,
  `packages/pdf/src/extension/plugins/<id>/`). A plugin declares what it reads
  (`inject`) and what it publishes (`provides`); the core refuses anything
  else, and the dependency graph is built from those declarations. Reach
  other capabilities through injected services and typed events, never by
  importing another plugin's internals. Register side effects through the
  plugin's context so they are undone when it stops.
- Markdown plugins reach VS Code only through the host services in
  `packages/markdown/src/shared/host` (`hostDocuments`, `hostCommands`,
  `dialogs`, `settings`, `workspace`, …); their VS Code adapters live in
  `src/host/services`. Inject the narrowest service that does the job, and
  fake it in tests with `fakeHost(overrides)`.
- The `TextDocument` owns text, saving and undo. Webviews only synchronize.
- Webviews are untrusted. Every message has a schema and is validated in
  both directions; the host re-checks paths and containment.
- Track editors per panel, never by file path: one file can be open twice.
- Each product owns its settings prefix (`markdownWorkshop.`, `pdfWorkshop.`)
  and its commands; one product's settings commands never show or write the
  other's.
- Keep the Copy Link for Agent reference wording compatible with LLM Wiki
  (`@path#start-end`). What both products hand to agents (the handoff text,
  the IDE context packet) is defined once, in `packages/agents`.
- Obsidian is a behaviour reference only. Never copy its code, CSS or assets.
  Compare in a disposable vault, never the owner's.
- Read the source from `~/Code/human-learning` at commit `ff3a902e`; never
  modify that repository or its worktrees.
- New automated coverage is unit tests unless the owner explicitly approves
  a browser/native regression. Keep the existing browser and native suites
  passing, including later owner-approved additions. See "Testing policy" in
  packages/markdown/IMPLEMENTATION_PLAN.md.

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

All source meets these limits except the PDF code still being split to them
(the viewer's React hooks and the agent integration). That exemption is listed
in `eslint.config.mjs`, pinned in `test/unit/lint-rules.test.ts`, and only
shrinks. When porting a long source function, rewrite it rather than copying
it. Another rule may have
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
pnpm test:browser  # each product's Chromium suite
pnpm test:vscode   # both products in a real, isolated VS Code window
```

`pnpm check:full` runs all three in that order. The real-VS Code specs
(`test/vscode`, `packages/pdf/test/vscode`) do **not** run in GitHub Actions: they were
flaky under load. They are a required local pre-push check, so run the full
`pnpm check:full` before every push, on a headless Linux box as
`xvfb-run -a pnpm check:full`.

Run suites sequentially, including across shared worktrees. Use a private
display and the test harness's isolated profile, never the owner's or a demo
profile. If a test port is occupied, identify its owner before proceeding;
do not kill unrelated processes or reuse another checkout's server.

Run Prettier from the repository root: `.prettierignore` there keeps the
test fixtures (whose hashes are pinned) as they are.

Commit at the end of each phase with its record in IMPLEMENTATION_PLAN.md.
Do not push or publish to the Marketplace without the owner's approval.
