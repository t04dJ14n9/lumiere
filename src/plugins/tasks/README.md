# Tasks

Owns inline checkboxes, rendered task handlers and checklist commands. Source
edits preserve prefixes and labels and verify the expected line before editing.
Embedded-note requests require a source previously authorized by resources;
the host rechecks realpath containment and edits the native TextDocument.

Injects editor, commands, livePreview and RPC in the webview; workbench, resources
and RPC in the host. All handlers and decorations are owned. Verify keys remain
unbound. Embedded UI coverage is completed with the embeds plugin.
