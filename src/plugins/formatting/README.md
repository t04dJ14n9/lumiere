# Formatting

Registers Markdown formatting and line commands through `commands`, with
owned keymaps through `editor`. Inline marker toggling is ported from the
pinned source and uses the shared dialect. Commands check read-only state and
dispatch ordinary transactions so the TextDocument retains undo authority.
Only bold, italics and insert-link have default keys; `verify` keys are unbound.
