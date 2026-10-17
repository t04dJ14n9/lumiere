# Obsidian 1.14.4 Properties: measured behaviour

Measured 2026-10-10 on the real app (CDP-driven, real key events). Probe scripts: `/workspace/obsidian-probe/props*.mjs`, `e1`-`e6.mjs`. Sample note: `/tmp/obsidian-test-vault/Properties.md` (copied to the repo's sample vault as `property.md`).

## Structure
- `div.metadata-container` > `.metadata-properties-heading` (collapse indicator + title "Properties") > `.metadata-content` > `.metadata-properties` > `div.metadata-property[tabindex=0][data-property-key]`.
- Row = `.metadata-property-key` (type icon `span.metadata-property-icon` + `<input class=metadata-property-key-input>`), `.metadata-property-value[data-property-type]`, hidden warning icon (`Type mismatch, expected <Type>`).
- Value widgets by type:
  - `text`: contenteditable `.metadata-input-longtext` (placeholder "Empty"); a value that is exactly `[[Link]]` renders as `.metadata-link` (clickable internal link + pencil flair to edit).
  - `number`: `<input type=number inputmode=decimal step=any>`.
  - `checkbox`: `<input type=checkbox>`.
  - `date`: `<input type=date>` plus a "Open daily note" link icon. `datetime`: `<input type=datetime-local>`.
  - `multitext` (List), `tags`, `aliases`: `.multi-select-container` with `.multi-select-pill` (content + remove "x") and a trailing contenteditable `.multi-select-input`.
- Type icons (lucide): text=`text`, number=`binary`, checkbox=`check-square`, date=`calendar`, datetime=`clock`, list=`list`, tags=`tags`, aliases=`forward`.

## Types
- Types come from a **vault-wide registry keyed by property name** (`.obsidian/types.json`, shown in `app.metadataTypeManager`), with inference from the value when the name is not registered (`true` -> checkbox, `3` -> number, `2026-10-08` -> date, list -> list, otherwise text). `tags`, `aliases`, `cssclasses` are built in.
- **Switching a type edits only `types.json`. The note's YAML is not rewritten.** If the value does not fit the new type the row shows the warning icon.
- Icon click opens the menu: `Property type >`, `Cut`, `Copy`, `Paste`, `Remove`. Submenu: `Automatic (<inferred>)` (only when the key is not reserved), `Checkbox`, `Date`, `Date & time`, `List`, `Number`, `Text` (alphabetical; the current one is checked). For `tags`/`aliases` every entry is disabled.
- Heading context menu: `Add file property`, `Sort >` (`Name (A to Z)`, `Name (Z to A)`), `Clear file properties`.

## Keyboard
- Row is a tab stop. **Tab order: key input -> value -> the same row -> next row** (rows, not inner inputs, are the tab stops when the row itself is focused).
- Enter in the key input -> focus the value. Enter in a text/number value -> focus returns to the row. Row focused: Arrow Down/Up move to next/previous row, **Delete removes the row** (Backspace does not), Escape returns focus to the document.
- Mod+; (Add file property) appends an empty row at the end and focuses its key input. A suggestion popup lists all vault property names; typing filters (`st` -> `status`, `list`). Enter accepts: the row is committed (`status:` written), the value widget for the known type is focused. An empty row is only written once it has a key. Escape does not discard the empty row. A duplicate key stays in the key input, nothing is written, no notice.
- Rename: edit the key input, Enter commits (focus goes to the value; for list rows the pill input). Renaming to an existing key or to empty is rejected (the input keeps the text, YAML unchanged).
- List/tags: type + Enter adds a pill and keeps focus in the input. Backspace in the empty input focuses the last pill; Backspace on a pill removes it. Enter on a focused pill edits it. Click on the "x" removes. Tags drop a leading `#`.
- Collapse: click the heading; the state (`is-collapsed`) is **global** (persists across notes and reopen).
- Text values: Enter commits; a written value that is not plain is quoted by the YAML writer.
- Checkbox: click or Space toggles and writes `true`/`false`.
