# Editor

Core `editor` plugin. Its registrations belong to the plugin context and are
removed on disposal. See DESIGN.md for its service and lifecycle contract.

Core Phase 3 is implemented; owner visual acceptance is pending.

The editor service exposes host-mediated clipboard read/write for feature
menus. Native CodeMirror clipboard events retain source text; structured
properties and HTML conversion belong to their feature plugins. View transfer
flushes first, rejects a moving document version, and retains the old source
identity to remap disclosure keys after rename. Unit tests cover independent
panel captures, backward selections, fold replacement and scroll restoration.

Extensions use one reconfigured compartment and the pure `ExtensionRegistry`.
Registrations sort by slot, catalog rank, owner ID and per-owner registration
order. `editor` binds `extend` to its consumer; an explicit owner supports
service forwarding such as Live Preview's caller-bound block/inline methods.
The registry removes registrations rather than leaving empty compartments.

Core owns `editor.useTabs` (true) and `editor.tabSize` (4, integer 1–16).
Configuration updates go through the existing editor fiber and reconfigure only
its settings compartment, preserving the document, selection and feature state.
View-state contributions validate their own payloads, restore on late registration,
and retain inactive/unknown keys. The old top-level `folded`/`folds` protocol
fields are read-only compatibility inputs; folding and callouts own their data.
