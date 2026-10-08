# Spellcheck

Owns spellcheck through the editor service. The feature is resource-scoped
and defaults to on. Disabling disposes its compartment and commands;
re-enabling installs a fresh instance. No cross-plugin internals are imported.
Manual acceptance is in docs/MANUAL_TEST_PLAN.md; Obsidian parity is not observed.

Sets the contenteditable `spellcheck` attribute. Dictionaries and visible
underlines are provided by the editor host/OS, not by a bundled dictionary.
