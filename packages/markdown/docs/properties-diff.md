# Properties parity with Obsidian 1.14.4

Reference: the complete measured spec at
`/workspace/plans/obsidian-properties-behaviour.md`, probes `e1`–`e6` and
`props*.mjs`, and `28-obsidian-properties.png`. This table records the starting
implementation, before the fixes. No Obsidian code, CSS or assets are copied.
The requested `/workspace/plans/properties-diff.md` is outside this session's
writable sandbox; this review is also copied to `/tmp/properties-diff.md`.

| Obsidian behaviour | ours today | action (fix / reject+why / defer+why) |
| --- | --- | --- |
| Container, heading with collapse indicator, content, properties, focusable keyed rows; key/icon, typed value, mismatch warning | Native details/summary and dl/dt/dd, property count; no typed value attribute | fix — use the measured div hierarchy, icon spans and hidden compatible warnings; remove count and retain plugin data attributes |
| Text/text, number/binary, checkbox/check-square, date/calendar, datetime/clock, list/list, tags/tags, aliases/forward icons | Hash, CircleCheck, Calendar for datetime, ListFilter, Tag; aliases use ListFilter | fix — use the named open-source Lucide icons |
| Text is an always-visible contenteditable with Empty placeholder | Display span, Edit button and hidden input | fix — inline contenteditable, commit on Enter/blur/save; protect unchanged mismatched values |
| Exact wikilink text is a clickable internal link with pencil to edit | Internal link followed by a textual Edit button | fix — link presentation and pencil; retain the normal injected link pipeline |
| Always-visible number/decimal/any, checkbox, date, datetime-local widgets | Scalars require Edit; checkbox already direct | fix — show native widgets immediately; pin checkbox click/Space and YAML writes |
| Date has Open daily note action | No daily note plugin or setting | defer+why — daily notes are outside this editor's supported capabilities; avoid an action that cannot resolve its target policy |
| Date picker appearance follows Obsidian's runtime | Chromium/VS Code webview native controls | reject+why — retain native date widgets; OS locale and picker appearance cannot be identical across VS Code platforms |
| List, tags and aliases use pills plus trailing contenteditable | Pills plus text input; aliases are an ordinary list | fix — trailing contenteditable and aliases identity; keep occurrence-aware concurrent edits |
| Type registry is per property name across the vault, with inference for unregistered names | Already lowercased name map, scoped by injected vault root, shared across panels | fix — preserve existing scope and add explicit cross-note/reopen/isolation tests |
| A type change only changes the registry, never YAML or undo | Preference notification offers conversion dialog and locally forces a widget; rename copies the old preference | fix — remove conversion/forced state and rename preference copying; render the chosen widget without changing the value |
| Mismatched values show Type mismatch, expected Type warning | Clickable ! action, fallback widget, hidden warning while forced | fix — persistent non-mutating warning icon and expected-type tooltip |
| Property type submenu: Automatic (inferred), Checkbox, Date, Date & time, List, Number, Text; checked current type | Icon opens direct type choices, unsorted, no checks | fix — submenu, exact order, Automatic clears registry, accessible check state |
| tags, aliases, cssclasses built in; type entries disabled | Only tags special-cased; aliases/cssclasses can be overridden | fix — reserved kinds take precedence; disable all type choices and reject host/store mutation |
| Icon and row menu: Property type, Cut, Copy, Paste, Remove | Icon direct types then Copy property/Remove property; context submenu but no Cut/Paste | fix — same row actions from either opener, preserve structured keyboard clipboard; parse YAML for menu paste through injected clipboard |
| Heading menu: Add file property, Sort > Name (A to Z)/Name (Z to A), Clear file properties | Flat Add/Sort/Remove all menu | fix — labels and submenu; retain guarded display sorting and transactional ordering on edits/drop |
| Key -> value -> same row -> next row tab routing; focused rows skip inner fields | Native icon/Edit/chip/button tab stops; row Tab already goes to neighbouring row | fix — explicit routing; pin the already-correct row-to-row motion |
| Enter in key commits and focuses value; text/number Enter commits and focuses row | Key Enter focuses row; scalar Enter already focuses row | fix — name-to-value focus including lists; pin scalar commit routing |
| Row Up/Down moves, Delete removes, Backspace does not, Escape returns to document | Selection captures Delete; row router lacks Delete/Escape, Mod+Backspace removes | fix — explicit pure routing and selection integration; Backspace never removes a row |
| Mod+; appends empty row and focuses key, offers filtered vault property names | Separate hidden Add/Cancel form, no name suggestions; creates header for notes without YAML | fix — inline pending row, popup and known-type focus; commit key only once valid; avoid YAML changes before a name exists |
| Empty pending row: Escape (and blur into the body) dismisses without writing; duplicate name remains in input, no write or notice | Escape used to leave the draft row; invalid add opens native validity/alert notice | fix — dismiss unfinished Add-property draft on Escape/blur (Host GUI BH-008); quietly reject invalid add |
| Empty/duplicate rename rejected, typed input retained and YAML unchanged | Pure YAML rejection already exists, but rejection displays validity/alert notice | fix — quiet validation and current-name guard; pin existing YAML rejection and retained draft |
| Sort persistence across reopen and exact non-ASCII/numeric collation | Display-only sorting, persisted with the next edit/drop | defer+why — probes establish menu structure but not sort persistence/collation; retain guarded existing ordering |
| Names differing only by case, fuzzy suggestion ranking and uncommon modifier combinations | No empirical rules supplied for these cases | defer+why — preserve existing exact YAML key matching and simple case-insensitive substring filtering; avoid inventing unmeasured behaviour |
| Enter adds pill and retains input focus; empty-input Backspace focuses last pill, then Backspace removes; Enter on pill edits; x removes | These behaviours already exist with native input; unchanged no-op add can refresh away focus | fix — preserve/pin pill actions while adapting contenteditable and repair focus across reconciliation |
| Tags drop a leading # | Already trim and drop one leading #, then validate | fix — extract/pin shared normalization for additions and pill edits |
| Collapse state: **per note** (measured in Obsidian 1.14.4 with `docs/obsidian-measurements/coll.mjs`: collapsing one note leaves another open, and a note keeps its state when reopened) | Native details defaults open; no persistence | fix — persist collapsed notes (by URI) in workspace state through validated host RPC; panels of the same note follow each other |
| Collapse state shared across VS Code workspaces | Storage adapter is workspace state | reject+why — Obsidian's state is per vault; ours is per workspace, which is the same unit |
| Text Enter writes quoted YAML when needed; checkbox click/Space writes boolean | YAML serializer and checkbox click already do this | fix — add regression tests that pin existing safe quoting/boolean behaviour |
| Nested/anchored/recursive YAML beyond the measured scalar/list spec | Nested maps, lists of maps and block scalars use YAML drafts; independent raw slices can fail for external aliases | fix — keep raw drafts when possible, serialize settable values when needed, show a Source mode message for tagged/recursive/unsupported values; Sources keeps custom rows above its draft |

Validation results and remaining manual checks are recorded in
`IMPLEMENTATION_PLAN.md` and `docs/MANUAL_TEST_PLAN.md`.

## Verification

The five tests in `src/plugins/properties/parity.test.ts` were run before source
changes and all failed: structure/widgets/icons, mismatch presentation, reserved
kinds, Delete/Escape/Backspace routing, and blank YAML for a new property.
`presentation.test.ts` also fails against the original HEAD implementation
(`docs/checks/properties-before-renderer.txt`): unchanged display configuration
recreated the renderer, losing pending rows. Existing matching behaviour has
additional pins for vault/name scope, inference, safe quoting, checkbox writes,
pill actions, occurrence matching and guarded YAML edits.

Final unit and browser results are in `IMPLEMENTATION_PLAN.md`. The single
browser attempt failed at Chromium launch with sandbox EPERM, before assertions.
No native editor or Obsidian was launched. Owner checks remain in the manual plan.

## Real-browser parity check (B8-1)

Side by side in real VS Code 1.141 (this extension, `test/fixtures/vault/property.md`) and Obsidian 1.14.4:
`docs/screenshots/properties-side-sheet.png` (Obsidian left, ours right) and
`docs/screenshots/properties-side-type-menu.png` (the Property type submenu).
Structure, icons, value widgets, pills, the Property type submenu order and the checked
"Automatic (Text)" entry match. Known remaining differences: menu items have no icons,
Obsidian's date link flair and row tooltip are absent, and the theme colours follow the
VS Code theme. Collapse state was re-measured and is per note (`obsidian-measurements/coll.mjs`).
