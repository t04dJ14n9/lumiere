# Markdown Workbench

A plugin-based Markdown Live Preview extension for VS Code and Cursor.
Implementation is in progress. The core editor can edit, save and undo through
VS Code; feature migration and full regression coverage remain incomplete.
This is a development prototype, not a completed parity release.

See [DESIGN.md](DESIGN.md) and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

Development: `pnpm install`, `pnpm check`, `pnpm test:browser`. Native tests use isolated profiles only.

Phase 3 is completed under the revised unit-test policy. The implemented
Phase 4 subset adds folding, line numbers, indentation guides, spellcheck,
auto-pairing, smart lists, Vim and formatting, with live feature settings.
It now also includes links, code blocks, math, diagrams, callouts, footnotes,
tasks, note/media embeds and page previews. These features have unit coverage
and manual acceptance scenarios; visual parity has not been accepted.
Phase 4 as a whole is incomplete; Phases 5–8 have not started. See the phase
records for the outstanding features and
[manual acceptance plan](docs/MANUAL_TEST_PLAN.md) for owner-run scenarios.
