# Folding

Owns folding through the editor service. The feature is resource-scoped
and defaults to on. Disabling disposes its compartment and commands;
re-enabling installs a fresh instance. No cross-plugin internals are imported.
Manual acceptance is in docs/MANUAL_TEST_PLAN.md; Obsidian parity is not observed.

Provides `fold` and owns Fold All, Unfold All and Toggle Fold commands.
`heading` and `indent` default to true. Heading ranges use shared metadata;
indentation uses the document tab width. Disposal unfolds before removing the
gutter and commands. The editor retains the state field for view persistence.
