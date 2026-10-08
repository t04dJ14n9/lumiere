# Page preview

Ports the pinned source's modifier-hover delay, Alt+Enter keyboard opening,
Escape dismissal, popup focus restoration and late-response generation checks.
Uses injected resources/render services; previews are read-only for tasks.
Attachment previews use the same render pipeline as notes. External schemes are
not fetched. All timers, DOM listeners and render passes stop with the view/plugin.
