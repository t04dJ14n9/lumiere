# OKF plugin family for Markdown Workbench: design plan

Date: 2026-10-09 (SGT). Status: **plan only**, nothing implemented or pushed. The workbench clone
(`/workspace/repos/vscode-markdown-workbench`, branch `continue-handover`) was only read.
Diagram: `okf-plugin-graph.png` (source `okf-plugin-graph.dot`).

Sources: workbench `docs/HANDOVER.md`, `DESIGN.md` §5–7, §10.2, §12, §16–20, §23, `src/plugins/catalog.ts`,
`src/shared/manifest.ts`, `src/host/{settings,features,workbench-features}.ts`, `scripts/generate-contributions.ts`,
`/workspace/plans/{plugins-architecture.md,plugin-graph.dot}`. OKF: `SPEC.md` v0.2 (cited **S§n**), sample bundles
`acme_retail`, `ga4`, `stackoverflow`, `crypto_bitcoin` (78 `.md`), reference viewer `generator.py`/`viz.js`/`viz.html`.

---

## 0. Summary

- **About 24 small plugins plus one library.** `okfCore` holds everything shared: the bundle model, the
  frontmatter reader, the bundle-relative link index, trust and staleness logic, and pure validation rules.
  Every other `okf*` plugin injects the `okf` service and **never imports another OKF feature plugin**. The
  graph is a DAG of depth ≤ 3.
- **Two general plugins**, `lint` and `gitDiff` (§6), are useful without OKF. The OKF diagnostics and history
  plugins **plug into them** and do not reimplement them. Neither general plugin depends on OKF.
- **One umbrella switch**, `markdownWorkbench.plugins.okf.enabled`, sits on top of the existing per-plugin
  switches (§2). Outside a detected bundle every OKF plugin stays inert, so the umbrella costs nothing in an
  ordinary vault.
- **Milestone 1** (§9) is `okfCore`, `okfDetect`, `okfHeaderCard`, `okfTrust` and `okfDiagnostics` on a minimal `lint`
  engine. Demo: open `acme_retail/metrics/gross-margin-legacy.md`. It shows a typed header card, a
  "deprecated · human-reviewed" badge, and an `okf/*` entry in the Problems panel for `log.md`'s reserved-file
  frontmatter.

Findings from the samples that shape the design:

| Finding | Consequence |
|---|---|
| **None of the 4 sample bundles declares `okf_version`.** Every root `index.md` has no frontmatter. | Detection cannot rely on S§12. A structural heuristic is needed (§3.1). |
| `acme_retail/log.md` carries frontmatter `type: Log`. S§3.1 says reserved names are not concepts. | Tolerate it. Show a hint, never an error. Do not count it as a concept. |
| `acme_retail/policies/*.md` use bundle-absolute links (`/metrics/gross-margin-legacy.md`, S§6.1, the *recommended* form). | The vault resolves a leading `/` from the **vault** root (DESIGN §12.3). That is wrong for a bundle nested in a vault, so `okfCore` resolves links from the **bundle** root. |
| The reference `generator.py` skips every link that starts with `/` (`if "://" in target or target.startswith("/"): continue`). The acme `viz.html` therefore has no edge from `policies/margin-standard` to `metrics/gross-margin-legacy`. | Our graph and export must handle both link forms. A unit test pins this case. |
| `viz.js` renders bodies with `marked.parse` straight into `innerHTML`, and `viz.html` loads cytoscape and marked from jsDelivr. | Our export sanitizes with DOMPurify and inlines its scripts. It makes no CDN calls and can run offline (§8). |
| Types seen: BigQuery Table 22, Reference 20, Metric 3, BigQuery Dataset 3, Policy 2, Attested Computation 2, Skill 1, Log 1. | Use a palette for the common types and a hashed colour for others. Unknown types are generic (S§4.1). |
| `ga4` and `crypto_bitcoin` write `generated:` and `tags:` in block style. `acme` uses flow style `{ by, at }`. | The frontmatter reader handles both. Edits must keep the original style (`yaml` `parseDocument`, already a dependency). |
| `acme_retail/attesters/sql_equality.py` sits inside the bundle and is referenced by `attester.resource`. | Open it as text only. **Never run it** (S§10, "OKF … does not execute anything itself"). |

---

## 1. Constraints taken from the workbench

- A plugin is `src/plugins/<id>/{manifest,api,protocol,host,webview}.ts` (DESIGN §6.1). ESLint forbids importing
  another plugin's files except `manifest.ts`, `protocol.ts` and `api.ts`. OKF plugins therefore share code only
  through (a) the `okf` service, whose types live in `okfCore/api.ts`, (b) `okfCore/protocol.ts` for webview RPC,
  and (c) a **new pure shared layer, `src/markdown/okf/`** (parsing, trust, link normalisation, rules). It sits
  beside `src/markdown/properties/frontmatter.ts`, which it reuses. Both runtimes and `tsx --test` can import it.
- Cross-plugin dependencies use `inject: { required | optional }`. A consumer whose required provider is off
  is `pending`, and Show Plugin Status reads "Waiting for OKF Core" (DESIGN §5.3, §6.3).
- Order comes from catalog rank (DESIGN §5.10). OKF plugins go after the current features in `features` (webview
  halves) or `workbenchFeatures` (window-level views), in the order of §4.
- Composition rule 3 (a plugin owns only what it declares) means the header card must not hide the
  `properties` sheet on its own authority. §4.3 adds a bail event to `properties/api.ts` for this.
- Custom editors have no `TextEditor`. VS Code code actions, hovers and completion providers do not reach our
  webview. Quick fixes, hovers and autocomplete must use the workbench's own channels: the `suggest` service,
  hover cards and RPC. The VS Code providers are registered too, for files opened as plain text.
- The `workbench` service has no diagnostics wrapper yet (no `createDiagnosticCollection` in `src`).
  `lint` adds `workbench.diagnostics(owner)` as a small host change.

---

## 2. Enabling, disabling and the OKF umbrella

Current mechanism: each feature has `markdownWorkbench.plugins.<id>.enabled`, a resource-scoped setting whose
default comes from `manifest.defaultEnabled`. Today the effective state is
`preset !== "minimal" && plugins.<id>.enabled` (`src/host/settings.ts:45`, `workbench-features.ts:27`, and the
generated when-clause in `generate-contributions.ts:173`).

Proposal: add a **group** to the manifest. It is a field on `Manifest`, not a new plugin kind.

```ts
readonly group?: "okf";            // manifest field
// effective = preset !== "minimal" && plugins[group].enabled && plugins[id].enabled
```

| Piece | Change |
|---|---|
| `shared/manifest.ts` | Add `group?: string`. A unit test checks that every `okf*` manifest has `group: "okf"` and no other manifest does. |
| Settings | Add `markdownWorkbench.plugins.okf.enabled` (resource scope). Each child keeps its own `plugins.<id>.enabled` and default. Turning the umbrella off disposes every OKF fiber at once (DESIGN §6.3). Turning it back on restores each child's own state. |
| `settings.ts`, `features.ts`, `workbench-features.ts` | Add one AND term using the group switch. Listen for changes to `plugins.okf.enabled`. |
| Generator | When-clauses gain `&& config.markdownWorkbench.plugins.okf.enabled`. The settings UI lists the group switch first, with "OKF:" prefixed titles. |
| Manage Plugins (§6.5) | The quick pick shows an "OKF (n of m on)" row that expands to the children. Add one command, **OKF: Enable Recommended Plugins**, which writes the defaults below at the chosen scope. |
| Runtime gating | Enabled is not the same as visible. Every OKF UI checks `okf.bundleFor(uri)` and the context key `markdownWorkbench.okf.inBundle`. A note outside a bundle sees no card, badge, diagnostic or view content. |
| Dependencies | A child whose provider is off stays `pending`. Examples: `okfDiagnostics` without `lint`, `okfPdfCapture` without `pdf`. The status shows "Waiting for Lint". Enabling a child never silently enables its providers. The recommended-plugins command does that explicitly. |

Defaults: umbrella **off** in the first release (opt-in, matching the owner's "backlinks off" stance). When the
umbrella is off and a folder with a root `index.md` carrying `okf_version` is opened, show one dismissible notice:
"This folder looks like an OKF bundle. Enable OKF support?" The notice is a local notification only. Owner
question Q1 (§11) asks whether to turn the umbrella on by default after acceptance.

---

## 3. `okfCore` (the library plugin)

| Field | Value |
|---|---|
| id | `okfCore` (`group: "okf"`, `kind: "feature"`, `defaultEnabled: true`, surfaces host + webview) |
| Purpose | Bundle discovery and model, frontmatter normalisation, bundle-relative link index, trust and staleness derivation, and incremental updates, exposed as the `okf` service (host) and `okfView` (webview). |
| Layers | `vault` (files, metadata incl. `frontmatter`, change events, DESIGN §12), `document` (unsaved text), `resources` (containment), `dialect` (one parse per note). Pure code in `src/markdown/okf/`. |
| OKF deps | none |
| UI | none (library). Logs to the Markdown Workbench output channel. |
| Size | **M** (~900 lines plus tests) |

### 3.1 Bundle detection (in core, because every plugin needs `bundleFor`)

A folder `F` is a **bundle root** when either of these holds:

1. `F/index.md` has frontmatter with `okf_version` (S§12). This is a **strong** signal.
2. **Structural (heuristic)**: `F/index.md` exists, at least `minConcepts` (default 3) non-reserved `.md` files are
   under `F`, and at least `typeRatio` (default 0.8) of them have a non-empty `type` (S§4.1, S§11.1–2). The parent
   of `F` must not qualify, so the topmost qualifying folder wins and subfolder `index.md` files stay inside one
   bundle (S§3).

All four samples qualify through rule 2: 100 % `type`, with a root `index.md`. A typical Obsidian vault does not,
because it has no `index.md` or few `type:` notes. `okfCore.detection: "auto" | "strict" | "manual"` controls this:
auto uses rules 1 and 2, strict uses rule 1 only, and manual uses only the folders listed in `okfCore.bundles`.
Users can always add or remove roots with **OKF: Treat Folder as Bundle** and **OKF: Not a Bundle**. Both write
`okfCore.bundles` in workspace settings, **never a file inside the bundle**. Nested bundles are allowed. The
innermost root owns a file.

### 3.2 Model

```ts
interface OkfBundle { root: Uri; id: string; version?: string; detectedBy: "okf_version" | "structure" | "manual";
  concepts(): readonly OkfConcept[]; concept(id: ConceptId): OkfConcept | undefined;
  indexes(): readonly OkfIndexFile[]; logs(): readonly OkfLogFile[]; stats(): OkfStats; partial: boolean; }
interface OkfConcept { id: ConceptId /* path minus .md, S§2 */; uri: Uri; type?: string /* undefined ⇒ nonconformant */;
  title: string /* fallback: filename, S§4.1 */; description?: string; resource?: string; tags: string[];
  status: "draft" | "stable" | "deprecated" | string /* absent ⇒ stable, S§5.4 */;
  generated?: { by: string; at?: string }; legacyTimestamp?: string /* v0.1 fallback, S§13.1 */;
  verified: { by: string; at: string }[] /* bare mapping ⇒ 1-element list, S§5.2, S§11 */;
  tier: "unverified" | "machine-confirmed" | "human-reviewed" /* S§5.3, key off "human:" S§7 */;
  staleAfter?: string; stale: boolean /* now >= stale_after, S§5.5 */;
  sources: OkfSource[]; usageWindow?: Window; computation?: OkfComputation /* S§10.2 */;
  extra: Record<string, unknown> /* every non-OKF key, preserved, S§4.1 */; links: OkfLink[]; footnotes: string[];
  findings: Finding[]; mtime: number; hash: string; }
interface OkfLink { href: string; form: "absolute" | "relative" | "external"; target?: ConceptId | Uri; broken: boolean; range: Range; }
```

- **Frontmatter** comes from the vault's existing metadata (`NoteMetadata.frontmatter`, DESIGN §10.2), so parsing is
  not repeated. Edits use `src/markdown/properties/frontmatter.ts` (`yaml` `parseDocument`), which round-trips
  unknown keys, comments and flow or block style (S§4.1 "SHOULD preserve unknown keys"). The `yaml` limits are set
  to `maxAliasCount: 100` and `prettyErrors`. Frontmatter over 64 KB is rejected.
- **Links**: markdown links from the metadata (`links`, `embeds`). `/x.md` resolves against the **bundle root**,
  and `./`, `../` and bare names resolve against the source folder (S§6.1). A target outside the bundle root is
  "external-local", not a concept. Unresolved links are `broken: true` and that is never an error (S§6.1, S§11).
  Folder links (`tables/`) resolve to `index.md` (S§8). Path-valued fields (`resource`, `sources[].resource`,
  `computation`, `executor.resource`, `attester.resource`) use the same resolver (S§6.2). A `sources[].resource`
  that is not URL- or path-like is a **scope descriptor** (S§5.1) and is not linked.
- **Link index**: forward edges per concept plus a reverse map. It is rebuilt only for changed concepts and for
  sources whose unresolved-link sets mention a created, deleted or renamed path (the same idea as DESIGN §12.2's
  `updateRelatedLinks`).
- **Index and log files**: `index.md` is parsed into sections (heading, then `* [Title](url) - desc`, S§8) and
  `log.md` into `{date, entries[{verb?, text, links}]}` (S§9). Both are kept as structured data for the tree,
  history and maintenance plugins.
- **Legacy v0.1**: `timestamp` is the fallback for `generated.at`. A body `# Citations` list becomes read-only
  pseudo-sources marked `legacy: true` (S§13.1).

### 3.3 Service (host) and protocol (webview)

```ts
interface OkfService {
  bundles(): readonly OkfBundle[]; bundleFor(uri: Uri): OkfBundle | undefined; conceptFor(uri: Uri): OkfConcept | undefined;
  resolve(href: string, from: Uri): OkfLink; backlinks(id: ConceptId, bundle: OkfBundle): readonly OkfLink[];
  query(q: OkfQuery): readonly OkfConcept[]; // type/tag/status/tier/stale/text facets, used by search, graph, agent tools
  registerRule(rule: OkfRule): Disposer;     // pure rules, see §4.5
  onDidChange: Event<{ bundle: OkfBundle; changed: ConceptId[]; removed: ConceptId[] }>;
  editFrontmatter(uri: Uri, patch: FrontmatterPatch): Promise<void>; // through documents, one undo group
}
```

`okfCore/protocol.ts` defines the `okf.concept` RPC. It pushes the active note's `OkfConcept` (resolved link
titles, tier, findings) to the webview, where the `okfView` service caches it for the webview halves of the card,
trust, links and hover plugins. Each push is one compact message per change, debounced 150 ms.

### 3.4 Settings (`markdownWorkbench.plugins.okfCore.config.*`, resource scope)

| Setting | Default | Meaning |
|---|---|---|
| `detection` | `"auto"` | `auto` / `strict` / `manual` (§3.1) |
| `minConcepts`, `typeRatio` | `3`, `0.8` | Heuristic thresholds |
| `bundles` | `{}` | Per-bundle overrides `{ "<folder>": { enabled, actor, staleSoonDays, exclude[], typeColors{} } }`. This is the **per-bundle settings** home. |
| `maxConcepts` | `20000` | Above this the bundle is `partial` (the vault limit is 50,000) |
| `actor` | `""` | Default actor for writes, e.g. `human:jinyang` (S§7). Used by the review, new-concept and log plugins. Empty ⇒ ask once. |

---

## 4. OKF feature plugins

Legend: **Def** = default when the umbrella is on. **Layers** = existing workbench layers. **OKF deps** are
`required` unless written *opt*. Sizes: S < 300, M 300–900, L > 900 lines including tests.

### 4.1 Overview

| # | id | Purpose (one line) | Layers | OKF / general deps | Def | UI surface | Size |
|---|---|---|---|---|---|---|---|
| 1 | `okfDetect` | Show bundle status, context keys and mark/unmark commands | commands | okfCore | on | status bar, commands, context key | S |
| 2 | `okfHeaderCard` | Render type/title/description/resource/tags as a card instead of raw YAML | livePreview, render, editor | okfCore | on | editor block widget | M |
| 3 | `okfTrust` | Trust tier, status and freshness badges, with stale and unverified warnings | livePreview, markers | okfCore | on | badges in card slot, banner, markers | S |
| 4 | `okfDiagnostics` | Non-blocking OKF validation as `okf/*` rules in the `lint` engine | (via lint) | okfCore, **lint** | on | Problems panel, squiggles, quick fixes | M |
| 5 | `okfLinks` | Resolve bundle-absolute links, style broken links, open targets in the right editor | links, livePreview | okfCore | on | link styling, `links/open` handler | S |
| 6 | `okfTree` | "OKF Bundle" view: group by type, or follow `index.md` sections | vault, commands | okfCore | on | Explorer tree view | M |
| 7 | `okfBacklinks` | Incoming, outgoing and broken links for the concept; bundle orphans | vault, commands | okfCore | off | tree view | S |
| 8 | `okfHover` | Hover preview of a linked concept: card, trust and first lines | livePreview, render | okfCore, *opt* okfTrust (service `okfTrustInfo`) | on | hover card | S |
| 9 | `okfSources` | Make `sources` clickable (URL, bundle path, PDF page/rect, `@Note.md#a-b`) and resolve `[^id]` footnotes to them | links, livePreview, render | okfCore, *opt* `pdf` | on | card section, footnote hover | M |
| 10 | `okfComputation` | Read-only Attested Computation view: runtime, parameters, executor, attester and receipt fields. **Never executes.** | livePreview, render | okfCore | on | block widget | S |
| 11 | `okfSuggest` | Link autocomplete across the bundle (`/path.md` form), plus `type`/`tags`/`status` value suggestions | suggest | okfCore | on | suggest popup | S |
| 12 | `okfSearch` | Quick pick and search with type/tag/status/tier/stale facets | commands, vault | okfCore | on | quick pick, command | M |
| 13 | `okfGraph` | Interactive concept graph: type/tag filters, local graph, trust colouring | resources | okfCore | off | webview panel | L |
| 14 | `okfHistory` | `log.md` timeline merged with per-concept git history and trust-field changes | vault | okfCore, *opt* **gitDiff** | off | tree view and webview panel | M |
| 15 | `okfReview` | Review queue (stale, stale soon, unverified, draft) with **Mark Verified** and **Extend Freshness** | commands | okfCore, *opt* okfLog (service `okfLogWriter`) | off | tree view, commands | M |
| 16 | `okfNewConcept` | New-concept wizard with per-type templates | commands, document | okfCore, *opt* okfIndex, *opt* okfLog | on | command, quick input | M |
| 17 | `okfIndex` | Generate or refresh `index.md` (S§8), shown as a diff and never silent | document, commands | okfCore | off | command, CodeLens-style button in the card | M |
| 18 | `okfLog` | Draft `log.md` entries (S§9) on create, deprecate or verify; the user confirms | document, commands | okfCore | off | notification, command | S |
| 19 | `okfCopyForAgent` | Copy a concept, or concept plus neighbours, as an agent-ready payload with trust caveats | commands, *opt* `agent` | okfCore | on | command, editor/title menu | S |
| 20 | `okfPdfCapture` | Create a concept from a selected PDF region with `sources` filled in | commands, document | okfCore, **`pdf`** (after merge), *opt* okfNewConcept services | off | PDF selection action | M |
| 21 | `okfExport` | Standalone single-HTML export of a bundle (graph, cards, bodies, sanitized, offline) | render | okfCore | on | command | M |
| 22 | `okfStats` | Bundle dashboard: counts by type, tier and status, stale timeline, broken links, sources coverage | resources | okfCore | off | webview panel | S |
| 23 | `okfAgentTools` | Read-only agent tools (MCP or LM tools): list, search, get, neighbours, stale | — | okfCore, *opt* `agentBridge` | off | none (tools) | M |
| 24 | `okfExtraKeys` | Show non-OKF keys in the card as "Other properties" and keep them on writes | livePreview | okfCore, okfHeaderCard (service `okfCardSlots`) | on | card section | S |

Edges into other OKF plugins (`okfHover → okfTrust`, `okfReview → okfLog`, `okfNewConcept → okfIndex/okfLog`,
`okfExtraKeys → okfHeaderCard`, `okfPdfCapture → okfNewConcept`) are **services declared in the provider's
`api.ts`** and are optional except for `okfExtraKeys`. They form a DAG with depth ≤ 3 (§7 diagram). Services
that cross plugins: `okfCardSlots` (card sections that other plugins fill), `okfTrustInfo` (badge model),
`okfLogWriter` (append a draft entry), `okfIndexWriter` (refresh an index), `okfConceptFactory` (create a concept
from a template). Each is about 20 lines of interface.

### 4.2 Plugin specs (fields not repeated from the table)

**1. `okfDetect`**: Settings: `statusBar: boolean = true`. Status item: "OKF · acme_retail · 9 concepts · v0.2?"
(the "?" means the version is undeclared; tooltip "detected by structure"). Clicking it opens `okfTree` or
`okfStats` when enabled, and otherwise a quick pick of bundle actions. Context keys: `markdownWorkbench.okf.inBundle`
and `.isConcept`. Commands: Treat Folder as Bundle, Not a Bundle, Rescan Bundles.
Tests: detection matrix over the fixtures (all 4 samples, the Obsidian-like false positive, a nested bundle,
an `okf_version` bundle, a manual override), and the context keys with the VS Code fake.
Risks: heuristic false positives. Mitigations: `strict` mode, the "Not a bundle" command, and the status item
saying how detection happened.

**2. `okfHeaderCard`**: Replaces the raw frontmatter block with a card: type chip (palette colour), title (H1
size, falling back to the filename, S§4.1), description, `resource` as an external link (opened through the
links pipeline, so http goes through `env.openExternal`), tags as chips (clicking one opens `okfSearch` when
enabled), and slots (`okfCardSlots`) for trust, sources, extra keys and computation.
**Coexistence with `properties`**: add a bail event `properties/present (uri, frontmatterRange) → "yield" | undefined`
to `properties/api.ts`. Today the properties sheet owns the frontmatter block. When the card claims the
block, properties yields. A caret inside the frontmatter, the card's **Edit properties** button, or the setting
`frontmatter: "card" | "card+properties" | "source"` shows the properties sheet or the raw YAML, following the
reveal rule (DESIGN §11.3). `inlineTitle` hides when the card shows a title (same event).
Settings: `frontmatter = "card"`, `showResource = true`, `typeColors = {}`. Tests: render tests over each fixture
concept (types, missing title, tags written as a string instead of a list, unknown keys untouched), reveal on
caret, toggling the plugin restores properties (composition rules 1 and 5), browser smoke screenshot. Risks:
layout fights with `properties` and `inlineTitle` (handled by the bail event), and the cost of re-rendering on
each keystroke in the frontmatter (re-render the card only when the frontmatter hash changes).

**3. `okfTrust`**: Badges: tier (`unverified` grey, `machine-confirmed` blue, `human-reviewed` green; S§5.3),
status (`draft` amber, `deprecated` strike-through with a banner "Deprecated: kept for links and history" from
S§5.4), freshness (`stale` red from `now >= stale_after`, S§5.5; `stale soon` within `staleSoonDays`), and
"generated by `reference_agent/gemini-2.5-pro` · 2026-06-30 22:00 SGT". Times are shown in the user's zone with a
label, and the raw UTC value is in the tooltip. Verified history is listed in the tooltip. Recursive source trust
(S§5.1 lineage) shows "2 of 2 in-bundle sources human-reviewed". Optional `markers` on `[^id]` footnotes whose
source is stale. Settings: `staleSoonDays = 30`, `warnUnverified = "banner" | "badge" | "off"` (default `badge`;
tiers are advisory, not access control, S§5.3), `clock` (test hook). Tests: tier table (bare mapping, list, mixed
actors, `human:` prefix, empty list), stale boundary at `==` (S§5.5 `>=`), timezone formatting, deprecated banner.
Risks: alarm fatigue in agent-generated bundles where everything is unverified (default is badge only, no
banner).

**4. `okfDiagnostics`**: Registers the `okf/*` rule pack into `lint` (§6.1). The rules are pure functions in
`src/markdown/okf/rules/`, so `okfExport` and `okfAgentTools` can reuse the same findings. **Nothing blocks:**
S§11 forbids rejecting a bundle. Severity levels: `warning` only for the conformance items of S§11.1–3,
otherwise `info` or `hint`.

| Rule | Spec | Default severity | Quick fix |
|---|---|---|---|
| `okf/frontmatter-missing` | S§11.1 | warning | Insert `---\ntype: \n---` with the caret on type |
| `okf/type-missing` | S§4.1, S§11.2 | warning | Pick from the bundle's existing types |
| `okf/reserved-file` (frontmatter in `index.md` other than root `okf_version`; `log.md` used as a concept, e.g. acme `type: Log`) | S§3.1, S§8, S§12 | hint | none (informational) |
| `okf/timestamp-offset` (ISO 8601 with explicit offset) | S§5 intro | info | Append `Z` |
| `okf/generated-by` (`generated` without `by`) | S§5.2 | info | — |
| `okf/verified-shape` (entries need `by` and `at`) | S§5.2 | info | — |
| `okf/actor-format` (`agent/model`, `human:`, `process:`) | S§7 | hint | — |
| `okf/status-value` (not draft/stable/deprecated) | S§5.4 | hint | Pick a value |
| `okf/stale` | S§5.5 | info | Extend freshness (via `okfReview` when on) |
| `okf/source-resource` (sources entry without `resource`) | S§5.1 | info | — |
| `okf/footnote-source` (`[^x]` with no `sources[].id == x`; cited id missing) | S§5.1 | info | Add a sources stub |
| `okf/broken-link` | S§6.1 (MUST tolerate) | hint, off for `draft` | Create the concept via `okfNewConcept` |
| `okf/orphan` (no incoming links, not in any index) | — | off | Add to `index.md` |
| `okf/index-entry` (missing concept or description in `index.md`) | S§8 SHOULD | hint | Refresh index (`okfIndex`) |
| `okf/log-date`, `okf/log-order` (`YYYY-MM-DD`, newest first) | S§9 MUST / format | info | Reorder |
| `okf/computation-runtime` (Attested Computation without `runtime`) | S§10.2 | info | — |
| `okf/legacy-timestamp`, `okf/legacy-citations` | S§13.1 | hint | Convert to `generated.at` / `sources` |
| `okf/version-unknown` (`okf_version` not 0.x) | S§12 (best effort) | info | — |

Never flagged: unknown `type` values, unknown keys, a missing `index.md` (S§11). Settings live in `lint`'s rule
table (`"okf/orphan": "off"`) and `.markdownlint.jsonc`. The plugin's own setting is `scope = "openFiles" |
"bundle"` (default `bundle`, so Problems shows the whole bundle once indexed). Tests: one positive and one
negative fixture per rule, the sample bundles expecting exactly the known hints (acme `log.md`), a 10k-concept
run under budget, and quick-fix edits that keep YAML style. Risks: Problems noise (only info and hint by
default), duplicate reports with generic lint link rules (`lint` dedupes by `(uri, range, code family)` and
`okf/broken-link` replaces `md/no-broken-links` inside a bundle).

**5. `okfLinks`**: Claims the `links/open` bail (DESIGN §16) **only for hrefs in notes inside a bundle**. It
resolves `/x.md` from the bundle root (the vault would use the vault root) and opens concepts in the workbench
editor with the fragment. Non-`.md` targets (`attesters/sql_equality.py`) open with `vscode.open`, never run. In
the webview, broken concept links get a dashed underline and "not yet written" tooltip (S§6.1). Settings:
`brokenStyle = "dashed" | "none"`. Tests: resolution table (absolute, relative, `../`, folder → `index.md`,
outside the bundle, fragment kept, `%20`), the bail ordering against `links`. Risk: a second resolver diverging
from the vault one (both are covered by the same table-driven test, and the `vault` link maps are reused for
anything outside bundles).

**6. `okfTree`**: View "OKF Bundle" with two modes: **By type** (type → concepts, counts, status icons) and
**By index** (follows `index.md` sections recursively, S§8; concepts not listed in any index go under
"Not in index"). Filters: tag, status, tier, stale. Reveals the active concept. Context menu: open, copy for
agent, new concept here. Settings: `mode = "type"`, `showReserved = false`, `sort = "title"`. Tests: tree from
acme fixture in both modes, a missing index, unknown types sorted last, reveal. Risk: refresh storms on large
bundles (debounced, diff-based `onDidChangeTreeData` per node).

**7. `okfBacklinks`**: View "Concept Links": incoming (with context line), outgoing, broken, and a bundle
**Orphans** list. Separate from the generic `backlinks` plugin because that one resolves `/` from the vault root.
Settings: `showContext = true`. Tests: acme `policies/margin-standard → metrics/gross-margin-legacy` (the edge the
reference viewer misses). Risk: users having two backlink views (the generic one is off by default, as the owner
decided).

**8. `okfHover`**: Hover on a concept link shows a mini card: type, title, description, tier and stale badges, and
the first 6 body lines rendered with `render` (sanitized). It **wins over `pagePreview` only for concept links in
bundles**, through rank and a bail event. Settings: `delayMs = 300`, `lines = 6`. Tests: hover data for broken,
deprecated and external links, browser smoke. Risk: overlapping with `pagePreview`; documented precedence.

**9. `okfSources`**: Card section "Sources" (ids, title, author, `usage_count` with `usage_window`,
`last_modified`), and `[^id]` footnote hover resolving through `sources` by id (S§5.1, keyed, not positional). Each
resource is classified:

| Resource form | Opens with |
|---|---|
| `https://…` | links pipeline → `env.openExternal` (confirm for other schemes, DESIGN §16) |
| bundle path to a concept (`policies/revenue-recognition.md`) | workbench editor (`okfLinks` resolver) |
| `refs/paper.pdf#page=3&viewrect=72,140,300,90` | `pdf.open(uri, {page, rect})` when the PDF plugin is active, else `vscode.open` with `#page=3` (DESIGN §23) |
| `@notes/Note.md#12-18` (Copy for Agent form, DESIGN §17) or `notes/Note.md#L12-L18` | workbench editor plus `navigate` to the line range (open options carry no selection; HANDOVER "Remaining 2") |
| scope descriptor (`all queries in project X`) | plain text, no link |

`viewrect` uses Adobe open-parameter order `left,top,width,height` in PDF points. This is our convention, since
the spec does not define fragments, and it degrades to a plain path elsewhere. Settings: `showCredibility = true`.
Tests: classifier table, footnote join by id after reordering, a PDF fallback without the `pdf` service, and
containment (a `../../etc/passwd` resource is refused by `resources`). Risks: the PDF location format must match
the PDF plugin's `openLocation` (agree on it in P3 of the architecture plan), and opening `@Note#a-b` at a range
depends on the navigate RPC.

**10. `okfComputation`**: For `type: Attested Computation` (S§10), it shows a contract panel: runtime chip,
parameter table (`name`, `type`, `required`), `computation` file or inline `# Computation` fence (S§10.3),
executor resource and `receipt` fields, attester resource, and a fixed note: "The workbench never runs
computations or attesters." There is **no run button in v1**. Settings: none. Tests: both acme computations and the
inline vs file forms. Risk: users expecting a run (stated clearly; any run feature belongs to an outside
extension through the API).

**11. `okfSuggest`**: Registers a source with `suggest`. After `](` in a bundle note it offers concepts by title,
id, type and description, and inserts `/abs/path.md` (S§6.1 recommended) or relative form per setting. In
frontmatter it suggests existing `type` values, tags, `status` enum, sources ids for `[^`, and the actor setting
for `by:`. Settings: `linkForm = "absolute" | "relative"`. Tests: ranking with fuzzy (`shared/fuzzy.ts`), insertion
text, frontmatter context detection. Risk: clashing with the `links` wikilink suggester (it only triggers on
markdown-link syntax inside bundles).

**12. `okfSearch`**: **OKF: Find Concept** quick pick with facet prefixes (`type:Metric tag:finance status:stable
tier:human stale:yes text`), and a results view. Uses `okf.query`, an in-memory inverted index over title,
description, tags and headings, built incrementally. Settings: `includeBody = false` (body text search uses the
existing `search` plugin). Tests: facet parser, query results over the samples. Risk: overlap with `search`
(scope is limited to metadata facets).

**13. `okfGraph`**: Webview panel showing the concept graph (cytoscape, MIT, **bundled locally and loaded lazily
only in this panel**; it never touches the editor bundle). Nodes are coloured by type and outlined by tier, with
dashed outlines for stale nodes and faded ones for deprecated. Edges are undirected-untyped relationships
(S§6.1), plus optional `sources` derivation edges. Filters cover type, tag, status and tier. **Local graph** mode
centres on the active concept with depth 1–3. Clicking a node opens the concept, and a side card shows its
header. Layouts are cose and breadthfirst (as in `viz.html`). The panel runs with the same CSP as the editor and
gets data only through RPC. Settings: `defaultMode = "local"`, `depth = 1`, `showSourceEdges = false`,
`maxNodes = 2000`. Above that it switches to clustering by type. Tests: graph builder (pure) on the acme
fixture, including the `/` link edge, filter logic, and a browser test for the panel. Risks: bundle size
(~350 KB min, kept out of the editor bundle and noted in THIRD_PARTY_NOTICES), performance above a few
thousand nodes.

**14. `okfHistory`**: Timeline per bundle and per concept that merges `log.md` entries (S§9, any level, with
links to concepts mapped back to them) with git commits for the file through **`gitDiff`'s `gitHistory`
service** (no git code here). Each commit is annotated with **trust-field changes** computed from the frontmatter
of both revisions (`verified` added, `status` → deprecated, `stale_after` moved, `generated.by` changed).
Clicking an entry opens `gitDiff`'s rendered diff. With `gitDiff` off, only log.md is shown. Settings:
`maxCommits = 100`, `showLog = true`. Tests: log parser (acme log), merge ordering, frontmatter delta function,
a fake `gitHistory`. Risk: rename history (uses `git log --follow` semantics through the API where available,
otherwise the history stops at the rename).

**15. `okfReview`**: View "OKF Review": stale, stale within N days, unverified, machine-only, draft, sorted by
`stale_after` and source `last_modified` newer than `verified.at` ("source changed since review"). Commands:
**Mark Verified** (appends `{by: <actor>, at: now UTC}` to `verified`, normalising a bare mapping to a list only
when appending, S§5.2), **Extend Freshness…** (date picker → `stale_after`), **Mark Deprecated**. Each write is one
undo group through `documents` and can optionally draft a `log.md` line via `okfLogWriter`. Settings:
`staleSoonDays` (inherits core), `requireActor = true`. Tests: frontmatter edits keep flow or block style and
unknown keys, round-trip on the samples, actor prompts. Risk: writing `human:` for a person who did not review
(an explicit command per concept, never bulk without a confirm dialog).

**16. `okfNewConcept`**: **OKF: New Concept…** picks a folder (defaults to the active one), a type (bundle types
plus templates), and a title; it writes `type`, `title`, `description`, `tags`, `generated: {by: <actor>, at}`,
`status: draft` and type-specific body headings (S§4.2: `# Schema`, `# Examples`, `# Computation`). Templates
come from settings, or from `<bundle>/.okf-templates/<Type>.md` files, which are treated as **plain text with
`{{title}}`-style placeholders only** (no code). Optional: refresh index and draft log entry. Settings: `templates
= {}`, `useBundleTemplates = true`, `filename = "kebab"`. Tests: rendering of templates, filename collisions,
reserved names refused (S§3.1). Risk: template placeholder injection (plain substitution, no evaluation).

**17. `okfIndex`**: **OKF: Refresh index.md** for a folder. It generates sections per S§8 (headings by type, or
existing headings kept; `* [Title](file.md) - description` from frontmatter; subfolders as `[name](name/index.md)`),
**preserves hand-written sections and prose**, keeps root `okf_version`, and shows a diff (native `vscode.diff`
with an untitled right side) before applying. Optional "keep in sync on save" (off). Settings: `groupBy = "type" |
"keep"`, `onSave = false`. Tests: idempotence on the acme indexes (no diff), new concept added, deleted concept
removed, prose preserved. Risk: overwriting curated text (it always shows the diff, and edits go through one undo
group).

**18. `okfLog`**: When a concept is created, deprecated or verified through OKF commands (never on a plain save),
it drafts `* **Creation**: Established [Title](/path.md).` under today's `## YYYY-MM-DD` heading (S§9, newest first)
in the nearest `log.md` and shows a notification with **Add** / **Edit** / **Skip**. Provides `okfLogWriter`.
Settings: `mode = "ask" | "auto" | "off"` (default `ask`), `level = "bundle" | "folder"`. Tests: date heading
insertion and ordering, existing frontmatter in `log.md` kept (acme), dates in UTC vs local (it uses the bundle's
UTC date; owner question Q4). Risk: log noise (opt-in, only for semantic actions).

**19. `okfCopyForAgent`**: **Copy Concept for Agent** puts this on the clipboard: `@path.md` reference, a compact
header (type, title, description, tier, status, stale flag, verified-by), `sources` list, body, and optional
depth-1 neighbours (titles plus descriptions). Under staleness or `deprecated` it adds a caveat line, following
S§10.5 "warn or refuse when stale". It uses the `agent` service (copyForAgent) for the reference format, and
**Ask Agent about Concept** goes through the same chat path as Ask Agent about Selection (HANDOVER). Settings:
`includeNeighbours = false`, `maxChars = 20000`. Tests: payload snapshot for acme revenue, truncation, a dirty
document (offer Save and Copy, as in DESIGN §17). Risk: leaking large bundles to the clipboard (size cap).

**20. `okfPdfCapture`**: With the PDF plugin merged (architecture plan P3, `inject: { required: ["pdf"] }`; it waits
until then), a PDF selection action **New OKF Concept from Selection** creates a concept through
`okfConceptFactory`: description from the selected text (editable), `sources: [{ id, resource:
"refs/paper.pdf#page=3&viewrect=…", title: <pdf title>, last_modified: <file mtime> }]`, a body quoting the passage
with `[^id]`, `generated: {by: <actor>}`, `status: draft`. The PDF must be inside the bundle, or the user picks to
copy it into `references/` (S§6.3). Settings: `targetFolder = ""`, `copyPdfIntoBundle = "ask"`. Tests: payload
built from a fake `pdf` selection, page and rect formatting, and the case outside the bundle. Risk: depends on the
PDF API shape (keep the contract in `okfCore/api.ts` as an adapter so only this plugin changes).

**21. `okfExport`**: **OKF: Export Bundle as HTML** writes one self-contained file. It follows the `viz.html` idea
(JSON data plus graph plus detail pane) but changes four things: (1) cytoscape and the renderer are **inlined**,
with no CDN, so it works offline; (2) bodies are rendered **at export time** with the workbench renderer and
sanitized with DOMPurify, so there is no `marked` and no `innerHTML` of raw markdown at view time; (3) both link
forms produce edges; (4) a strict CSP `<meta>` (`default-src 'none'; script-src 'nonce-…'; img-src data: https:`).
It includes cards, trust badges, facets, local graph, `log.md` timelines and findings. Settings: `includeBodies =
true`, `includeFindings = true`, `maxBytes = 50MB`. Tests: snapshot of the data model, the script-tag fixture
escaped, `javascript:` links dropped, size guard. Risk: file size on huge bundles (bodies optional, compressed
JSON).

**22. `okfStats`**: Dashboard webview: concepts by type, tier and status, stale now and in 30/90 days, broken link
count, orphan count, % with sources, % with description, top tags, generators (`generated.by`) and verifiers.
Clicking any number opens `okfSearch` with that facet. Settings: none. Tests: stats function (pure) on the
fixtures. Risk: low.

**23. `okfAgentTools`**: Read-only tools `okf_list_bundles`, `okf_search {facets, text}`, `okf_get_concept {id}`
(frontmatter, body, tier, stale, findings), `okf_neighbors {id, depth}`, `okf_stale {within_days}`. They register
through the planned **agent bridge** (`agentBridge` service, MCP server, see `plugin-graph.dot`) when present, and
otherwise through `vscode.lm.registerTool` where the host supports it. Results are capped (`maxResults = 50`,
`maxChars = 40000`) and trust caveats are always included. **No write or execute tools in v1**; computation
attestation is out of scope (S§12 "deferred"). Settings: `enabledTools = all`, `allowUntrusted = false`. Tests: tool
schemas, result shapes, caps, untrusted refusal. Risks: Cursor's support for LM tools is uncertain (the bridge is
the main path), and prompt injection from bundle text reaching agents (returned as data, labelled "bundle content,
untrusted").

**24. `okfExtraKeys`**: Card section "Other properties" (collapsed by default) listing every key that is not an
OKF key (§3.2 `extra`) as read-only key/value rows, with an **Edit in properties** link. It never rewrites or
drops these keys (S§4.1). Settings: `collapsed = true`, `hide = []`. Tests: preservation across `okfReview` and
quick-fix edits (property-based round trip). Risk: none notable.

### 4.3 Kernel and host changes needed (small, each with tests)

| Change | For | Size |
|---|---|---|
| `Manifest.group`, umbrella setting, generator and status UI | §2 | S |
| `workbench.diagnostics(owner)` returning a disposable collection | `lint` | S |
| `properties/present` and `inlineTitle` bail events | `okfHeaderCard` | S |
| Hover precedence event for link hovers (`pagePreview` vs `okfHover`) | `okfHover` | S |
| `src/markdown/okf/` pure shared layer (allowed by the layer test `test/unit/layers.test.ts`) | everything | M |

---

## 5. Compatibility

**PDF viewer (to be merged, `plugins-architecture.md` P3/P6).** OKF plugins use the `pdf` service only through
optional or required injection: `okfSources` opt, `okfPdfCapture` required. With PDF off, sources open with
`vscode.open` plus `#page=N`, today's behaviour. Agree the location type `{ page, rect?: [l,t,w,h] }` with the
PDF plugin's `openLocation` so `okfSources`, P6 item 1 (PDF links in notes) and Copy-for-Agent PDF links share one
parser (put it in `src/shared/`). Future PDF **annotation sidecars** (JSON next to the PDF) get history and diffs
through `gitDiff` (§6.2), and a sidecar annotation can become a `sources` entry via `okfPdfCapture`.

**Agent bridge.** `okfAgentTools` registers tools with the bridge, and `okfCopyForAgent` uses the existing
`agent` service and Ask Agent path. All OKF payloads use the `@path#a-b` reference format (DESIGN §17), so agent
replies link back into the editor. Neither plugin injects the bridge as required.

**Existing plugins.** `properties` yields through an event (§4.3). `backlinks`, `pagePreview` and `search` keep
working outside bundles, and inside bundles the OKF variant takes precedence only where declared. `linkUpdates`
must rewrite bundle-absolute links on rename. `okfLinks` contributes a `files/willRename` listener (serial) for
`/x.md` forms inside the bundle. Marp and other frontmatter users are unaffected, since nothing activates outside
detected bundles.

---

## 6. General (non-OKF) plugins

Neither depends on OKF. OKF plugins plug into them through services. This keeps one Problems source, one git
integration and one diff renderer.

### 6.1 `lint`: Markdown lint

| Field | Value |
|---|---|
| id | `lint` (no group; `kind: "feature"`) |
| Purpose | markdownlint-style rules with Problems-panel diagnostics, inline squiggles in the live editor, quick fixes, per-rule settings and `.markdownlint.*` config files. Also hosts rule packs from other plugins (`okf/*`). |
| Layers | `vault` (workspace files, change events), `document` (unsaved text), `editor` + `livePreview` (webview squiggles), `commands`, `dialect` (lezer parse), host `workbench.diagnostics` (new, §4.3) |
| Deps | none. Provides the `lint` service `{ registerRules(pack): Disposer; findings(uri); fix(uri, findingId) }`. |
| Default | **on**, but generic rules start **off** until a `.markdownlint.{jsonc,json,yaml,yml}` is found or `lint.preset` is set. It costs nothing by default. The `okf/*` pack runs only inside bundles. |
| Settings | `preset = "none" \| "recommended" \| "strict"` (`none`), `rules = {}` (`"MD013": false`, `"okf/orphan": "off"`, severity overrides), `configFile = "auto"` (search upward from the note to the workspace folder), `scope = "openFiles" \| "workspace"` (`openFiles`), `squiggles = true`, `runOn = "type" \| "save"` (`type`, 400 ms debounce) |
| UI | Problems panel (one collection, source "Markdown Workbench"), wavy underline decorations in the webview with hover tooltip and **Fix** / **Disable rule for file** buttons, a status bar count, **Lint: Fix All in Note**, and a `CodeActionProvider` for the same diagnostics when the file is open in VS Code's text editor |
| Engine | Generic rules come from the `markdownlint` library (MIT), run in the existing vault worker (`dist/workers/`) on file text, with its built-in `fixInfo` used for quick fixes. Rule packs registered through the service are pure functions over `{text, metadata, bundleContext}`. Only **declarative** config files (`.jsonc/.json/.yaml/.yml`) are read. `.markdownlint.cjs`/`.js` and `customRules` paths are **ignored, never required or run** (security). Inline `<!-- markdownlint-disable MD013 -->` comments are honoured. |
| Tests | config discovery and merge order, rule toggles and severities, worker round-trip, squiggle mapping through edits (as markers do), quick fix producing the expected `WorkspaceEdit` and one undo group, `.cjs` config ignored, untrusted workspace (declarative config still read, no custom rules), rule pack registration and dedupe, composition (toggle off removes decorations and the collection) |
| Size | **L** (engine M plus webview squiggles and fixes) |
| Risks | Bundle size (`markdownlint` plus micromark ≈ 300 KB, host or worker only, notices update), double parsing (markdownlint uses micromark, our editor uses lezer; acceptable in a worker), Obsidian-flavoured syntax (wikilinks, callouts, `==mark==`) triggering false positives (ship a `recommended` preset that disables MD033/MD034/MD042-style rules on Obsidian syntax), quick fixes in a custom editor (webview buttons, not the VS Code lightbulb) |

**OKF-aware rules**: the `okf/*` pack (missing `type`, broken links, stale concepts, and the rest of §4.2 item 4)
is registered by `okfDiagnostics`, which reuses `okfCore`. From the user's side they are lint rules, configured in
the same `rules` table and `.markdownlint.jsonc`. In code, `lint` never imports OKF, so the DAG stays clean.

### 6.2 `gitDiff`: git diff viewer

| Field | Value |
|---|---|
| id | `gitDiff` |
| Purpose | For the current note (or any file): diff against HEAD or any revision, side-by-side text and **rendered markdown** diff, gutter change markers in the live editor, and file history. Also the `gitHistory` service that `okfHistory` and later PDF sidecars use. |
| Layers | `editor` + `livePreview` (gutter, webview), `render` (rendered diff), `commands`, `document` (buffer text), `vault` |
| Deps | VS Code built-in git extension (`vscode.git`, `getAPI(1)`), optional at runtime: when git is absent or disabled the plugin shows "Git not available" and stays `active` with nothing to do. No shelling out. Provides the `gitHistory` service `{ repoFor(uri); log(uri, {max, follow}); show(uri, ref); diff(uri, refA, refB?); onDidChangeHead }`. |
| Default | **on** (the gutter is cheap; panels open on demand) |
| Settings | `gutter = true`, `compareTo = "HEAD" \| "index"` (`HEAD`), `renderedDiff = "words" \| "blocks"` (`words`), `maxLog = 200`, `ignoreFrontmatterOrder = false` |
| UI | Gutter bars (added, modified, deleted) in the webview beside line numbers, with a click to peek the hunk and revert hunk. Commands: **Compare with HEAD**, **Compare with Revision…** (quick pick from `log`), **Open Side-by-Side Diff** (native `vscode.diff` with `api.toGitUri(uri, ref)`), **Open Rendered Diff** (webview panel: both revisions rendered through `render`, blocks aligned, word-level insertions and deletions highlighted, frontmatter shown as a key-level table), **File History** (tree view). editor/title button. |
| Engine | `repository.show(ref, path)` and `log({path, maxEntries})` and `diffWithHEAD`, through the git API. Buffer vs HEAD diff uses a pure Myers line diff in `src/shared/diff.ts` (no new dependency; word diff in the same module). HEAD text is cached per `(path, HEAD commit)` and recomputed on `document/changed` with a 300 ms debounce. A `diffRenderers` registry (`register({ match: glob, render })`) lets the PDF plugin later register a renderer for annotation sidecars, and lets `okfHistory` register the trust-field summary above concept diffs. |
| Tests | Myers and word diff (property tests), hunk mapping to gutter decorations through edits, fake git API (`show`, `log`, missing repo, file not in HEAD, renamed file), rendered diff pairing of blocks and tables, frontmatter key diff, revert hunk = one undo group, toggling off removes the gutter |
| Size | **L** |
| Risks | Git API surface differs between VS Code and Cursor builds (feature-detect `log`/`show`, native smoke in both), large files (cap the gutter diff at 1 MB or 20k lines), line-number gutter crowding (place after `lineNumbers` and before `folding` in the catalog), `follow` across renames not exposed by API v1 (history stops at rename; documented) |

**Reuse rule:** `okfHistory` never calls git itself. It reads `gitHistory` and registers a `diffRenderers`
decorator for concepts. `okfDiagnostics` never publishes diagnostics itself. It registers a rule pack in `lint`.

---

## 7. Dependency diagram

`okf-plugin-graph.png` (from `okf-plugin-graph.dot`). Blue: existing layers. Grey dashed: planned neighbours (PDF,
agent bridge). Green: general plugins. Orange: `okfCore`. Yellow: OKF features, with the milestone-1 set in bold
outline. Solid edges are required and dashed edges optional. Every OKF feature points down to `okfCore`; there
are no cycles. `test/unit/okf/dag.test.ts` asserts acyclicity and that OKF-to-OKF edges use only `api.ts` services.

---

## 8. Performance and security

### 8.1 Performance (large bundles)

| Concern | Design | Budget |
|---|---|---|
| Cold index | Reuse the vault metadata (already parsed in the worker, persisted in `storageUri`). `okfCore` derives concepts from it without reading files again. Derivation is chunked in 5 ms slices on the host. | 10k concepts: model ready in ≤ 2 s after `vault/resolved`; host never blocked > 16 ms per slice |
| Warm start | Persist the derived model (`okf-index.json` per bundle, keyed by file hash) next to the vault snapshot, written atomically ≤ every 2 s | ≤ 300 ms for 10k unchanged concepts |
| Incremental | On `vault/changed`, re-derive only the changed concept, update the reverse link map for sources whose unresolved sets mention the path, and re-run rules for that concept plus affected backlinks. Emit one `onDidChange` per batch. | 1 changed concept → UI updated ≤ 100 ms |
| Typing | The card, trust and squiggles update from the open document's frontmatter hash only (body edits skip the card). Lint debounces to 400 ms in the worker. | keydown budget unchanged (DESIGN §20: ≤ 12 ms) |
| Views | Trees fire per-node changes. Graph: `maxNodes`, clustering, layout in a web worker inside the panel. Stats are computed from the model, not files. | graph of 2k nodes interactive (≥ 30 fps pan) |
| Limits | `maxConcepts` 20k (beyond that, `partial` with a status warning), frontmatter 64 KB, body read lazily for export or agent only | — |
| Measurement | Add a generated 10k-concept fixture (`scripts/gen-okf-fixture.ts`) to the DESIGN §20 harness | raw samples recorded |

### 8.2 Security

- **Never execute bundle content.** There is no run of `computation`, `executor` or `attester` resources (S§10
  explicitly leaves execution to consumers; we choose not to). `.py`, `.sql` and `.sh` targets open as text.
  Templates are placeholder-substituted, never evaluated. Lint ignores JS config files and custom-rule paths.
- **Untrusted workspaces** (`capabilities.untrustedWorkspaces: limited`, DESIGN §19): viewing, card, trust,
  diagnostics, tree and search work. Off are remote favicon or metadata lookups for `resource` URLs (none are
  planned), `okfAgentTools` (unless `allowUntrusted`), writes from `okfIndex` and `okfLog` in `auto` modes, and
  bundle templates from `.okf-templates/`.
- **Rendering**: every body, hover and export goes through the existing DOMPurify sanitizer. Frontmatter values
  are shown as **text** (never HTML) in cards. Links follow DESIGN §16 (confirmation for unusual schemes;
  `javascript:` is dropped).
- **Containment**: path-valued fields are resolved with `resources` containment (vault root plus `realpath`). A
  source that escapes is shown but not opened.
- **YAML**: `maxAliasCount` (no alias bombs), size caps, and no custom tags (`yaml` core schema).
- **Agents**: tool output marks bundle text as untrusted data and adds trust caveats. There are no write tools in
  v1.
- **Webviews** (graph, stats, rendered diff) use the editor's CSP, nonce scripts and RPC schema checks. The export
  carries its own strict CSP.

---

## 9. Phased build order

Every phase ends with `pnpm check`, plus `pnpm test:browser` for webview changes and `pnpm test:vscode` for
native wiring (HANDOVER rules). Bug fixes are separate commits with unit tests.

| Phase | Contents | Demo / exit criterion | Est. |
|---|---|---|---|
| **M1: minimal, demoable** | §4.3 kernel bits (`group`, `workbench.diagnostics`, `properties/present`); `src/markdown/okf/`; **`okfCore`**, **`okfDetect`**, **`okfHeaderCard`**, **`okfTrust`**; **`lint` engine only** (service, Problems collection, squiggles, no markdownlint library yet); **`okfDiagnostics`** with the conformance and trust rules (`frontmatter-missing`, `type-missing`, `reserved-file`, `stale`, `verified-shape`, `timestamp-offset`); fixtures F1–F4 | Open `test/fixtures/okf/acme_retail` with the umbrella on. The status bar shows "OKF · acme_retail · 9 concepts". `metrics/revenue.md` shows a card with a "human-reviewed · stable · stale after 2026-12-31 08:00 SGT" badge. `gross-margin-legacy.md` shows a deprecated banner. The edge-case fixture's stale concept turns red, and the Problems panel lists `okf/*` items. Turning the umbrella off restores the properties sheet with no reload. | 1.5–2 wk |
| M2: navigate | `okfLinks` (resolver, `links/open`, rename rewrites), `okfTree`, `okfHover`, `okfSources` (no PDF), `okfSuggest`, `okfExtraKeys`, `okfComputation`; diagnostics: link, footnote and index rules | Navigate acme by tree, hover and link, including `/metrics/…` links. Footnote `[^revenue-policy]` opens the policy concept. | 2 wk |
| M3: general plugins | `lint` full (markdownlint library, config files, quick fixes, CodeActionProvider); **`gitDiff`** (gutter, compare, rendered diff, `gitHistory`, `diffRenderers`) | `.markdownlint.jsonc` drives rules. Gutter shows edits vs HEAD. Rendered diff of `metrics/gross-margin.md` across two commits. | 2–3 wk |
| M4: history, review, authoring | `okfHistory` (on `gitHistory`), `okfReview`, `okfLog`, `okfNewConcept`, `okfIndex`, `okfBacklinks`, `okfSearch` | Stale queue → Mark Verified → log line drafted → history shows "verified added by human:…". | 2–3 wk |
| M5: graph, export, agents | `okfGraph`, `okfExport`, `okfStats`, `okfCopyForAgent`, `okfAgentTools` (bridge or LM tools) | Exported acme HTML opens offline and shows the `policies → gross-margin-legacy` edge. An agent answers "which revenue concepts are stale?" with the tool. | 2–3 wk |
| M6: PDF | `okfPdfCapture`; `okfSources` PDF locations through the `pdf` service; `gitDiff` sidecar renderer | Select a region in a PDF → a draft concept with `sources[0].resource = refs/x.pdf#page=3&viewrect=…`, and clicking it reopens the box. Starts after architecture-plan P3. | 1–2 wk |

M3 can run in parallel with M2 (different owners). `okfHistory` waits for `gitDiff`, and the full rule set waits
for the `lint` library integration, so no OKF plugin builds its own git or diagnostics code in the meantime.

---

## 10. Test fixture plan (`test/fixtures/okf/`)

| # | Fixture | Contents | Used by |
|---|---|---|---|
| F1 | `acme_retail/` | Copied verbatim from the OKF repo (Apache-2.0; add `ATTRIBUTION.md` with the commit; fixtures are not packaged by the `.vscodeignore` allowlist). It has flow-style YAML, `log.md` with frontmatter, `/` links, computations, a `.py` attester, and a deprecated metric. | all |
| F2 | `ga4-mini/` | 5 concepts from `ga4` (block-style YAML, multi-line `description`, Reference type, nested `references/metrics/index.md`) | core, tree, card |
| F3 | `edge/` | `index.md` with `okf_version: "0.2"`; `only-type.md` (`type` only, conformant per S§11); `no-frontmatter.md`; `empty-type.md`; `bare-verified.md` (mapping); `mixed-verifiers.md`; `stale.md` (`stale_after` in the past) and `stale-boundary.md` (== clock); `draft.md`; `unknown-type-and-keys.md` (`type: Quantum Widget`, `x_owner: …`); `bad-timestamps.md` (`2026-06-30`, no offset); `footnote-mismatch.md`; `broken-links.md` (abs, rel, folder, outside bundle); `orphan.md`; `v01.md` (`timestamp`, `# Citations`); `log.md` with out-of-order and malformed dates; sub-folder `index.md` with a stray frontmatter | rules, trust, links |
| F4 | `not-a-bundle/` | Obsidian-style folder: `.obsidian/`, notes with `type: meeting` on 40 %, no `index.md` | detection false-positive guard |
| F5 | `nested/vault/kb/` | Bundle inside a vault with `.obsidian` at `vault/`; `/x.md` links must resolve to `kb/x.md`, not `vault/x.md` | okfLinks, core |
| F6 | `hostile/` | `<script>` in body and in `title`, `javascript:` link, `resource: file:///etc/passwd`, `../../` source, YAML alias bomb, 1 MB frontmatter, symlink out of the bundle, a `.okf-templates/` with `{{constructor}}`-style placeholders | security tests, export |
| F7 | `pdf-sources/` | Concept with `refs/sample.pdf#page=2&viewrect=72,140,300,90` and `@notes/Note.md#3-5` sources plus a tiny generated PDF (reuse the PDF plugin's test PDF after merge) | okfSources, okfPdfCapture |
| F8 | generated `large/` | `scripts/gen-okf-fixture.ts --concepts 10000 --links 5` (deterministic seed, not committed; generated into `/tmp` by the perf test) | perf |
| F9 | git fixture | Built at test time in `/tmp`: init a repo, commit F1, then commit `verified` added, `status → deprecated`, rename. Driven through a fake `vscode.git` API in unit tests and the real one in native smoke. | gitDiff, okfHistory |

Layers: pure code in `tsx --test`; host halves on the VS Code fake; browser specs (card, badges, squiggles, gutter,
graph); one native smoke (F1 card, `okf/reserved-file` in Problems, Compare with HEAD).

---

## 11. Open questions for the owner (recommended default in bold)

- **Q1** Umbrella default: **off in the first release, on after acceptance** / on now.
- **Q2** Detection default: **`auto` (okf_version or structure)** / `strict`.
- **Q3** Header card replaces the properties sheet in bundles: **yes, with Edit properties and caret reveal** /
  show both.
- **Q4** `log.md` dates: **UTC date** (matches spec timestamps) / local date (SGT).
- **Q5** Graph library: **cytoscape bundled locally, lazy** / write a small force layout (no dependency).
- **Q6** Generic lint rules: **library `markdownlint` in the worker** / own rules on lezer only (smaller, fewer
  rules).
- **Q7** Agent tools without the bridge: **register as VS Code LM tools where supported** / bridge only.
