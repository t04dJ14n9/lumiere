# Vim

Owns vim through the editor service. The feature is resource-scoped
and defaults to off. Disabling disposes its compartment and commands;
re-enabling installs a fresh instance. No cross-plugin internals are imported.
Manual acceptance is in docs/MANUAL_TEST_PLAN.md; Obsidian parity is not observed.

The library has no public `removeEx` API: disposal deactivates ex callbacks;
re-enabling replaces them. Native undo/redo/save hooks are restored on disposal.
Cell-editor mode transfer remains part of the unfinished tables migration.
