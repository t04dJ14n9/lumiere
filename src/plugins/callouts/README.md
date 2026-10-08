# Callouts

Recognizes callout blockquotes using the shared Markdown grammar and renders
through the common sanitized renderer. Disclosure state is panel-local and saved
with presentation state. Supports nested callouts and source reveal at the caret.
Insert Callout quotes every selected line in one host-undoable transaction.

Injects editor, commands, render and livePreview. Styles, renderers, commands and
all disclosure handlers are fiber/pass-owned. No default key binding.
