# Properties

Edit frontmatter in an inline sheet with typed values, pills, property menus and
keyboard navigation, like Obsidian 1.14.4’s Properties in document.

## How it works

A Live Preview widget reconciles the sheet against the latest frontmatter while
retaining focused draft inputs. Edits use the pure YAML operations and become one
outer-document transaction. List and chip drafts resolve the selected occurrence
against current values before committing, so a stale render cannot replace a
concurrently edited list. Save participants commit drafts and reject invalid
input. Nested YAML drafts come from source node ranges and commit as text,
retaining comments, quoting and exact numbers. Replaced anchors materialize their
external aliases with exact integers. Types are a vault-wide registry keyed by
property name, scoped by the injected vault root. Changing a type only changes
that registry; a mismatched YAML value
retains its warning until edited. Collapse is one persisted workspace preference
shared by notes and panels. New rows remain drafts until their names are accepted.

## Files

- `manifest.ts`: display configuration, feature identity and Add File Property.
- `api.ts`: editing and heading-focus event types.
- `protocol.ts`: validated type, vault-name and disclosure RPC.
- `host.ts`: shared stores and per-panel RPC registrations.
- `type-store.ts`: vault/name preferences and shared subscriptions.
- `collapse-store.ts`: per-note disclosure persistence (as in Obsidian) and same-note subscriptions.
- `collapse-store.test.ts`: disclosure propagation, rendering and reopen checks.
- `property-names.ts`: vault metadata and registered-name suggestions.
- `name-suggestions.ts`: one pending row’s accessible filtered popup.
- `webview.ts`: named display, controls, preferences and draft-flush registrations.
- `presentation.ts`: display changes and a sheet for notes without YAML.
- `presentation.test.ts`: repeated Add/display calls retain pending rows.
- `context.ts`: internal sheet adapter capabilities.
- `editing.ts`: source edits, focus and registry/disclosure presentation state.
- `edit-transaction.ts`: pure edit/order composition into one ChangeSet.
- `edit-transaction.test.ts`: stale, no-op, rename, removal and order coverage.
- `widget.ts`: Live Preview sheet widget lifetime and reuse.
- `sheet.ts`: DOM reconciliation and draft preservation.
- `sheet-html.ts`: measured structure, inline widgets, warning and pending-row HTML.
- `sheet-html.test.ts`: type, escaping, recursive alias and control-rendering units.
- `sanitize.ts`: property-specific sanitized HTML policy.
- `rows.ts`: row reconciliation and focused field retention.
- `fields.ts`: checkbox and scalar field registrations.
- `field-draft.ts`: scalar and raw YAML drafts, validation and commit/cancel focus.
- `controls.ts`: structural controls, retained panel bindings and ordering.
- `control-edits.ts`: structural transactions and focus restoration.
- `row-name.ts`: quiet name validation and rename-to-value focus.
- `row-menu.ts`: checked type submenu and row clipboard/removal actions.
- `row-navigation.ts`: row keyboard routing and focus movement.
- `controls.test.ts`: removal focus and key-routing unit tests.
- `form.ts`: inline pending rows, suggestion acceptance and shared heading collapse.
- `form.test.ts`: retained drafts, quiet rejection and deferred YAML creation.
- `heading.ts`: sheet heading focus and paging.
- `lists.ts`: list reconciliation and add/remove transactions.
- `list-input.ts`: add-item input events, composition and save handling.
- `list-values.ts`: supported YAML scalar/list values and tag normalization.
- `chips.ts`: chip focus, menus and clipboard bindings.
- `chip-actions.ts`: narrow actions available to chip bindings and drafts.
- `chip-draft.ts`: one chip's commit/cancel and post-commit focus recovery.
- `chip-values.ts`: occurrence matching against a concurrently changed list.
- `selection.ts`: row selection and structured clipboard payloads.
- `order.ts`: sorting, row drag ordering and cancellation.
- `value-input.ts`: native/contenteditable text, validity and selection operations.
- `clipboard-values.ts`: bounded, validated YAML clipboard mapping parsing.
- `parity.test.ts`: regressions demonstrated failing on the starting implementation.
- `rules.test.ts`: name/type/menu/tab/tag/clipboard pure rules.
- `interaction.test.ts`: actual field/row/pill event and commit wiring with narrow fakes.
- `editing.test.ts`: edit ordering, stale headers, chip identity and RPC checks.
- `list-values.test.ts`: list normalization and scalar identity checks.
- `host.test.ts`: preference RPC lifecycle.
- `type-store.test.ts`: persisted preferences and shared-store notifications.
- `properties.css`: sheet and field styling, bundled through
  `src/webview/styles/index.css`.

## Services, events and settings

The host injects `rpc`, `vault` and `workbench`; the webview injects `editor`,
`document`, `livePreview`, `commands`, `rpc` and `menu`. The webview provides
`propertyRenderers`, so another feature can replace one property's markup.
`sourcesProperty` registers `sources` there.
Widgets bind sheet content; heading interactions call `editor/focusTitle`.
Edits emit `render/changed` and `editor/clearProjection`; RPC receives type
preferences and shared disclosure; name suggestions use indexed vault metadata.
Settings are `markdownWorkshop.properties.display`
(`visible`, `hidden`, `source`) and `markdownWorkshop.plugins.properties.enabled`.

## Limits and differences from Obsidian

Native TextDocument save and undo are authoritative. Menus use the editor menu
service; structured clipboard uses the `obsidian/properties` payload. Type
preferences follow the root supplied by the vault service. Source mode shows YAML;
Add File Property can temporarily show the sheet when properties are hidden.
Disclosure is shared within the VS Code workspace, rather than across unrelated
workspaces. Native picker appearance depends on Chromium, OS and locale. Daily
note links are not provided because the editor has no daily-note capability.
YAML drafts must parse independently. Recursive aliases, tagged collections
(including `!!pairs`, `!!map` and `!!set`) and timestamps remain display-only.
Concurrent frontmatter changes reject an active draft without overwriting source.

## The caret never enters the block

As in Obsidian, the text caret cannot be inside the frontmatter while it is shown as a
widget (`caret-guard.ts`): every selection endpoint in it moves to the start of the body
(arrow keys, Home, Select All, Shift selections, reveals, undo, opening the note), and
typing, deleting or moving lines never touches it (Backspace at the body start does
nothing). Property edits are not user input events, so they pass. ArrowUp on the first
body line focuses the Add property button (`heading.ts` `enter`), and the Add button
walks back up the rows or down to the text. Measurements:
`docs/obsidian-measurements/properties/`.
