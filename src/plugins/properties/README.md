# Properties

Typed YAML property sheets preserve source formatting through the pure property
edit operations. Scalar and list drafts retain their actual DOM input while other
rows reconcile. Structural changes and display ordering commit as one document
transaction; native undo remains authoritative. Menus use the editor service.

`display` selects visible, hidden (revealed by the source caret), or source YAML.
Add File Property temporarily shows the sheet. Type preferences are persisted by
vault root; choosing an incompatible type asks before presenting a conversion.
The vault service currently supplies a workspace root; nested-root discovery is
Phase 5 work. Save flush participants commit drafts and reject invalid input.

Rows support selection, sorting, drag order, and `obsidian/properties` clipboard
payloads. Disabling removes renderers, commands, RPC, menus, drag listeners and
pending type dialogs. Title focus uses a typed event owned by inlineTitle.
