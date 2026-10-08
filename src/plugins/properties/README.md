# Properties

Edit YAML properties in a typed sheet with scalar inputs, list chips, row
selection and ordering, like Obsidian's Properties in document.

## How it works

A Live Preview widget reconciles the sheet against the latest frontmatter while
retaining focused draft inputs. Edits use the pure YAML operations and become one
outer-document transaction. List and chip drafts resolve the selected occurrence
against current values before committing, so a stale render cannot replace a
concurrently edited list. Save participants commit drafts and reject invalid
input. Type preferences are stored by the injected vault root.

## Files

- `manifest.ts`: display configuration, feature identity and Add File Property.
- `api.ts`: editing service and typed heading-focus events.
- `protocol.ts`: validated property type requests and notifications.
- `host.ts`: type store and per-panel RPC registrations.
- `type-store.ts`: persisted preferences and shared subscriptions.
- `webview.ts`: renderer, draft flush, commands and editing service registrations.
- `context.ts`: internal sheet adapter capabilities.
- `editing.ts`: source edits, focus and type-conversion orchestration.
- `edit-transaction.ts`: pure edit/order composition into one ChangeSet.
- `edit-transaction.test.ts`: stale, no-op, rename, removal and order coverage.
- `widget.ts`: Live Preview sheet widget lifetime and reuse.
- `sheet.ts`: DOM reconciliation and draft preservation.
- `sheet-html.ts`: initial sheet and property row HTML.
- `sanitize.ts`: property-specific sanitized HTML policy.
- `rows.ts`: row reconciliation and focused field retention.
- `fields.ts`: checkbox and scalar field registrations.
- `field-draft.ts`: one scalar draft, validation and commit/cancel focus.
- `controls.ts`: structural controls, retained panel bindings and ordering.
- `control-edits.ts`: structural transactions and focus restoration.
- `row-name.ts`: name validation, rename commit and chosen-type retention.
- `row-menu.ts`: type and row selection menus.
- `row-navigation.ts`: row keyboard routing and focus movement.
- `controls.test.ts`: removal focus and key-routing unit tests.
- `form.ts`: add-property form and header controls.
- `heading.ts`: sheet heading focus and paging.
- `lists.ts`: list reconciliation and add/remove transactions.
- `list-input.ts`: add-item input events, composition and save handling.
- `list-values.ts`: supported YAML scalar/list normalization.
- `chips.ts`: chip focus, menus and clipboard bindings.
- `chip-actions.ts`: narrow actions available to chip bindings and drafts.
- `chip-draft.ts`: one chip's commit/cancel and post-commit focus recovery.
- `chip-values.ts`: occurrence matching against a concurrently changed list.
- `selection.ts`: row selection and structured clipboard payloads.
- `order.ts`: sorting, row drag ordering and cancellation.
- `type-dialog.ts`: confirmation for incompatible type conversion.
- `styles.ts`: sheet and field styling.
- `editing.test.ts`: edit ordering, stale headers, chip identity and RPC checks.
- `list-values.test.ts`: list normalization and scalar identity checks.
- `host.test.ts`: preference RPC lifecycle.
- `type-store.test.ts`: persisted preferences and shared-store notifications.

## Services, events and settings

The host injects `rpc`, `vault` and `workbench`; the webview injects `editor`,
`document`, `livePreview`, `commands`, `rpc` and `menu`. Provides no service.
Widgets bind sheet content; heading interactions call `editor/focusTitle`.
Edits emit `render/changed` and `editor/clearProjection`; RPC receives type
preferences. Settings are `markdownWorkbench.properties.display`
(`visible`, `hidden`, `source`) and `markdownWorkbench.plugins.properties.enabled`.

## Limits and differences from Obsidian

Native TextDocument save and undo are authoritative. Menus use the editor menu
service; structured clipboard uses the `obsidian/properties` payload. Type
preferences follow the root supplied by the vault service. Source mode shows YAML;
Add File Property can temporarily show the sheet when properties are hidden.
