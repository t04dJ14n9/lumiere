# Auto pair

Owns auto pair through the editor service. The feature is resource-scoped
and defaults to on. Disabling disposes its compartment and commands;
re-enabling installs a fresh instance. No cross-plugin internals are imported.
Manual acceptance is in docs/MANUAL_TEST_PLAN.md; Obsidian parity is not observed.

`brackets` and `markdown` independently control pairing families. Uses the
CodeMirror close-brackets input handler and empty-pair Backspace keymap.
