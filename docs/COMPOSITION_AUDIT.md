# Composition audit — 8 October 2026

Scope: all 27 implemented plugin manifests and their registered host/webview
halves, against DESIGN.md §5.4, §5.5, §5.10, §9.2, §11.2 and §21.1. This is a
source and unit-test audit. Owner visual acceptance is **not run**. It does not
claim completion of the remaining Phase 4 features or Phases 5–8.

## Violations and fixes

1. Event priority depended on activation history. Kernel listeners now sort by
   prepend slot, catalog rank, owner ID and registration order within an owner.
2. Editor compartments were appended in activation order. One ordered extension
   registry now supplies stable precedence slots; every bootstrap uses catalog
   ranks. Line numbers precede folding; table overrides precede Vim.
3. Delegated Live Preview registrations lost their feature owner. Caller-bound
   services retain that owner through block and inline registration.
4. Block matching selected the last matching renderer. First-ranked matching
   renderers now win; generic engine blocks occupy the base fallback slot.
   Mermaid's specific renderer precedes general code fences.
5. Editor indentation settings were missing as an explicit core responsibility.
   Core now supplies validated useTabs/tabSize settings (true/4 by default),
   with host handshake/notifications and a private settings compartment. No
   feature sets outer-editor singleton settings; the source guard and effective
   facet assertions cover this across the catalog.
6. Core owned folded ranges and callout disclosure memory. Generic view-state
   contributions now leave validation, capture and restoration to the feature.
   Inactive/unknown keys survive; late contributors restore independently.
   Folding's field disappears when disabled. Existing fold/scroll/selection
   transfer assertions were retained in the relocated unit file.
7. Configuration changes recreated feature fibers. Controllers now call update;
   editor, folding and autoPair use private compartments. Properties replaces
   only its renderer while retaining the editing service and registrations.
   Links retains listeners because its options are read by the host per request.
8. Folding config updates lost ranges and bypassed the metadata cache by passing
   freshly allocated strings. The fold service reconfigures in place and reads
   metadata with immutable Text keys. The gutter explicitly refreshes when that
   service or tab width changes; CodeMirror's default refresh omits both.
9. Callout view restoration did not refresh already mounted disclosures or
   remap nested ancestry on rename. Plugin-owned bindings now apply restored
   values to live disclosures and remap both local and nested source prefixes.
10. Composition checks compared registration owners without checking their
    behavior. They now also compare key bindings, block/inline renderer order,
    winning renderers, content attributes, pair data and fold-service results
    with fresh starts. They exercise all 19 features individually, configuration
    changes and a seeded 60-toggle sequence, verify fiber/context retention and
    protect core settings and unrelated fold state. A separate AST guard scans
    all production feature modules for singleton-setting contributions.

## Per-plugin review

Each entry checks registration ownership/order, singleton settings, local state,
configuration handling and disposal. “No additional violation” means none found
within this composition scope, not full feature acceptance.

- **document (host/webview):** sessions remain host-authoritative; per-view sync,
  flush participants and input grouping have owned lifetimes. No additional violation.
- **editor (host/webview):** panel maps remain keyed by panel ID; fixed registry,
  core settings, caller ownership and generic view-state contribution handling.
- **dialect (host/webview):** one fixed grammar; renderer factory/service scoped
  to the provider; immutable Text caches do not set UI precedence. No additional violation.
- **commands (host/webview):** unique IDs reject duplicates; per-panel handlers
  and palette registrations are owned; host keys use override rank. Host settings
  only change enablement, so no config-driven fiber recreation remains.
- **vault (host):** snapshot service has no editor contributions; dependencies
  gate consumers. Shared live indexing is still explicitly Phase 5.
- **resources (host/webview):** RPC/service registrations are owned; authorization
  identities are scoped to the panel. No additional composition violation.
- **render (webview):** serial processors and bail fence claims use kernel order;
  passes own disposal. No editor singleton settings. No additional violation.
- **livePreview (host/webview):** fixed caller forwarding, first renderer wins
  and base fallbacks; mode compartment owns engine fields and commands.
- **tables:** table fields, projections, cell views, commands and render passes
  belong to tables. Override slot precedes Vim. Optional Vim/formatting service
  changes deliberately re-gate the table fiber; fresh-start composition is tested.
- **properties (host/webview):** host subscriptions are disposable; display
  changes now preserve the fiber and editing service, replacing only the renderer.
  Renderer registration remains after its other extension, including after updates.
- **pagePreview:** view plugin owns its timer, request generation and popup;
  destroy cancels/closes it. No additional violation.
- **embeds:** caller-owned block/inline renderers and pass-owned enhancement,
  media listeners and async cancellation. No additional violation.
- **tasks (host/webview):** caller-owned inline renderer, commands and pass
  listeners; host RPC follows enablement. No additional composition violation.
- **footnotes:** caller-owned inline/block renderers; ordered pre/post-process
  hooks, per-pass references and disposal. No additional violation.
- **callouts:** disclosure state moved from core into its contribution; live
  bindings and nested rename mapping fixed; pass and plugin disposal remove bindings.
- **diagrams:** catalog rank precedes codeBlocks; fence claim uses bail and async
  queue work is pass-owned. No additional violation beyond renderer ordering.
- **math:** caller-owned renderers/commands and pass-owned lazy rendering cleanup.
  No additional violation.
- **codeBlocks:** plain code is decorated source lines (no widget); only
  processor-accepted fences get a widget, re-registered when processors change,
  after diagrams; syntax extension and copy/highlight handlers are owned. No
  additional violation.
- **links (host/webview):** owned renderer/listeners/commands and host handlers;
  configuration no longer reissues initial navigation by restarting the webview half.
- **formatting:** unique command registrations, keymap slot and injected active
  view hooks; consumes read-only state without setting it. No additional violation.
- **lineNumbers:** owned gutter extension; deliberate catalog position before
  folding is stable after toggles. No additional violation.
- **folding:** owns field, saved ranges, service, gutter and commands; preserves
  ranges on updates, shares metadata cache and explicitly refreshes gutter settings.
- **indentGuides:** consumes editor tab width; view updates rebuild decorations.
  No singleton override. No additional violation.
- **spellcheck:** content attribute overrides the editor's lowest-precedence
  default; disabling removes it. No additional violation.
- **autoPair:** config now replaces only language data; close-bracket state and
  keymap remain installed. No editor-wide indentation settings.
- **smartLists:** owned Markdown keymap in keymap slot, uses editor indentation.
  No additional violation.
- **vim:** override slot after table navigation; library command hooks restored
  on stop. Existing Ex callbacks are deactivated because the library offers no
  removeEx API; they cannot act after disposal and re-enablement replaces them.

## Limits and compatibility

Legacy top-level folded/folds payloads remain schema-checked compatibility inputs;
new captures use contributions. Equal ranks use owner ID as a deterministic tie
break, including external owners after built-ins. No new browser/native tests
were added. Unit fixtures do not mount DOM widgets: gutter appearance, active
property drafts, table/Vim focus and split-panel recovery are owner scenarios in
MANUAL_TEST_PLAN.md. Existing Vim Ex cleanup is a library limitation, not a new
exception introduced by this change.
