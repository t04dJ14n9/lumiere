# Complete rename: Markdown Workbench → Markdown Workshop

Date: 2026-10-15  
Status: revised after ChatGPT High REQUEST CHANGES (B1–B6)  
Repo (current): `t04dJ14n9/vscode-markdown-workbench`  
Branch for this doc: `docs/complete-workshop-rename`  
Related: PR #54 already shipped **display name** “Markdown Workshop”; this spec finishes the identity rename.

## Review provenance

Revised to address blockers **B1–B6** from ChatGPT High critique:

- Chat: [Complete Workshop rename design](https://chatgpt.com/g/g-p-6ad0841322fc81919438032f917cf8e8-markdown-workshop/c/6ad0c5ed-cb74-83ea-88f3-f6b5b5733a40)
- Local review record: `/workspace/plans/chatgpt-mw-rename/ANSWER.md` (verdict: REQUEST CHANGES)
- Author judgment: fold B1, B2, B4, B5 fully; B3 as a **simple** manifest↔runtime parity check (not an API taxonomy essay); B6 as a light twin-fixture landing rule. Skip over-engineering.

## Goal

Finish a **breaking, complete** identity rename from Workbench → Workshop. Nothing is published on the Marketplace; **no legacy aliases, no settings migrations, no dual command ids**.

## Locked decisions (user-approved)

| Surface | Old | New |
|---|---|---|
| Marketplace / UI display name | Markdown Workshop (done in #54) | **unchanged** |
| Extension id | `t04dj14n9.vscode-markdown-workbench` | `t04dj14n9.vscode-markdown-workshop` |
| `package.json` `name` / VSIX base | `vscode-markdown-workbench` | `vscode-markdown-workshop` |
| GitHub repository | `vscode-markdown-workbench` | `vscode-markdown-workshop` |
| Command ids, settings keys, view ids, context keys | `markdownWorkbench.*` | `markdownWorkshop.*` |
| Custom editor `viewType` | `markdownWorkbench.editor` | `markdownWorkshop.editor` |
| Backward compatibility | — | **none** (breaking OK) |

Do **not** implement code, merge this branch into product code, or rename the GitHub repo until a follow-up implementation PR is approved.

## Non-goals

- Display-name-only tweaks (already done).
- Migrating user `settings.json` / keybindings from old keys.
- Keeping `markdownWorkbench.*` as aliases or deprecations.
- Renaming VS Code built-ins that contain the word “workbench” (e.g. `workbench.editorAssociations`, `workbench.action.*`, context key `workbenchState`).
- Changing product behavior unrelated to identity strings.
- Renaming the sibling PDF extension (separate spec); only update **cross-references** that name this extension.
- Exhaustive VS Code contribution-point taxonomy essays in this design (see B3: parity check only).

## Inventory (approximate, as of 2026-10-15 on `main`)

| Token / surface | Occurrences (order of magnitude) | Notes |
|---|---|---|
| `markdownWorkbench` | ~820 in `src`/`test`/`docs` | Commands, settings, viewTypes, contexts |
| `markdown-workbench` | ~1350 | Package name, paths, prose, some DOM/ids |
| `Markdown Workbench` | ~40 | Stale prose (display already Workshop) |
| `MarkdownWorkbench` / `MarkdownWorkbenchApi` | ~40 | TS API types |
| `Workbench` / `WorkbenchPanel` / `createWorkbench*` | product types + many false positives | Rename **product** types; keep VS Code “workbench” wording |
| `mw-*` CSS classes | ~290 tokens | Already “MW”; keep unless a class literally says `workbench` |
| `SETTING_PREFIX` | `"markdownWorkbench."` | Single source of truth in `src/shared/setting-schema.ts` |
| Contribution generator | `scripts/generate-contributions.ts` | Hard-codes `` `markdownWorkbench.${id}` `` |
| Full extension id `t04dj14n9.vscode-markdown-workbench` | API docs, fixtures, `@ext:` filters, `EXTENSION_ID` | See B2 checklist |

Authoritative contribution constants today:

- `MARKDOWN_EDITOR.viewType` = `markdownWorkbench.editor` (`src/shared/editor-provider.ts`)
- `SETTING_PREFIX` = `markdownWorkbench.` (`src/shared/setting-schema.ts`)
- `EXTENSION_ID` / `EXTENSION_FILTER` = `t04dj14n9.vscode-markdown-workbench` / `@ext:…` (`src/host/settings-access.ts`, `src/plugins/settings/commands.ts`)
- Manifest command ids are **unprefixed** in plugin manifests; the generator adds `markdownWorkbench.`

## Proposed new identity map

### Packaging / hosting

| Kind | New value |
|---|---|
| Publisher (unchanged) | `t04dj14n9` |
| Full extension id | `t04dj14n9.vscode-markdown-workshop` |
| npm / VSIX `name` | `vscode-markdown-workshop` |
| VSIX artifact | `vscode-markdown-workshop-<version>.vsix` |
| GitHub (after cutover) | `https://github.com/t04dJ14n9/vscode-markdown-workshop` |
| `package.json` `repository.url` / bugs / homepage | Update in **phase 2** metadata commit after GitHub rename (see B5) |

### Runtime contribution prefix

| Kind | Pattern |
|---|---|
| Settings | `markdownWorkshop.<rest>` |
| Commands | `markdownWorkshop.<rest>` |
| Views / view containers | `markdownWorkshop.<rest>` |
| Custom editors | `markdownWorkshop.editor`, `markdownWorkshop.graph`, `markdownWorkshop.renderedDiff`, … |
| Context keys contributed by us | `markdownWorkshop.<rest>` (and when-clauses that reference them) |
| Configuration section title | already “Markdown Workshop” / keep aligned |
| Command `category` | already “Markdown Workshop” |

Mechanical rule: replace the contribution namespace string `markdownWorkbench` → `markdownWorkshop` everywhere it is **our** namespace. Do not touch foreign namespaces.

### TypeScript / module names (product façade)

| Old | New |
|---|---|
| `MarkdownWorkbenchApi` | `MarkdownWorkshopApi` |
| `Workbench` (host façade in `shared/runtime.ts`) | `Workshop` |
| `WorkbenchPanel` | `WorkshopPanel` |
| `createWorkbench` | `createWorkshop` |
| `createWorkbenchPanel` | `createWorkshopPanel` |
| File `src/host/workbench.ts` | `src/host/workshop.ts` |

Comments that mean “VS Code workbench” stay as “workbench”. Prefer symbol-aware rename for product types; do **not** blind-replace bare `Workbench`.

### CSS / DOM

| Old | New |
|---|---|
| Identifiers / data attrs / strings `markdown-workbench` | `markdown-workshop` |
| Class prefixes that literally include `workbench` | `workshop` equivalent |
| `mw-*` classes | **keep** (abbreviation already matches Workshop) |

### Docs, tests, CI, scripts

- README, CHANGELOG, API.md, CAPABILITIES.md, DESIGN.md, plans, handoffs: Workbench → Workshop; package/repo ids updated.
- Tests and fixtures that assert command ids, setting keys, viewTypes, or extension id.
- `.github/workflows/*`, package scripts, `pnpm package` output names.
- Agent handoff / bridge docs that still say Workbench or old package id (see B6 for twin fixtures).

### Explicitly out of rename

- VS Code keys: `workbench.editorAssociations`, `workbench.colorCustomizations`, `workbenchState`, etc.
- Third-party / upstream names.
- Git history / old PR titles / historical session notes that quote old identities (leave as historical; put on allowlist — see B1).
- Local folder checkouts named `vscode-markdown-workbench` until operators rename them (document only).

---

## B2 — Full extension-id / deep-link inventory (short checklist)

Changing `package.json` `name` changes the canonical id `publisher.name`. Search and update every consumer of the **old full id**, not only `markdownWorkbench`:

| Surface | Old token to find |
|---|---|
| Full extension id | `t04dj14n9.vscode-markdown-workbench` |
| Settings filter | `@ext:t04dj14n9.vscode-markdown-workbench` |
| Install / deep links (docs) | `vscode:extension/t04dj14n9.vscode-markdown-workbench` |
| URI-handler docs (if any) | `vscode://t04dj14n9.vscode-markdown-workbench/` |

Audit targets (keep this list short; skip empty classes when absent):

1. `vscode.extensions.getExtension(...)` call sites and API examples (`API.md`, `src/host/api/types.ts`, sample plugin).
2. `extensionDependencies` / `extensionPack` in this repo and sample fixtures.
3. `EXTENSION_ID` / `EXTENSION_FILTER` constants and tests that assert `@ext:…`.
4. Sibling PDF Workshop repo: old full id, command ids, and repo name in docs/fixtures (cross-ref only).
5. Workspace recommendations / `.vscode/extensions.json` / devcontainer lists — **if present** (currently none tracked in this repo).

New values: `t04dj14n9.vscode-markdown-workshop`, `@ext:t04dj14n9.vscode-markdown-workshop`.

---

## B4 — Persistent-state policy (fresh extension)

Extension id change + uninstall of the old VSIX ⇒ treat the renamed extension as a **fresh** install.

**Policy:** no migration of `globalState`, `workspaceState`, `SecretStorage`, `globalStorageUri`, `storageUri`, webview localStorage, or manually named caches. Loss/reset is accepted (matches locked no-back-compat rule).

Known owned stores today (audit at implement time; do not invent migrations):

- `context.workspaceState` passed into `createWorkbench` (`src/host/extension.ts`)
- `context.storageUri` used by vault snapshot store (`src/host/vault-system.ts`)

**Smoke:** uninstall old VSIX → install new VSIX → activate once; confirm editor/`markdownWorkshop.editor`, settings search, and commands work with empty state.

---

## B5 — Two-phase GitHub rename order

Do **not** point `package.json` `repository.url` / bugs / homepage at `vscode-markdown-workshop` before that GitHub repo exists. Split hosting cutover:

**Phase 1 — code/package/runtime rename PR (merge to `main`):**

- Change extension id, `name`, contribution prefixes, types, CSS/DOM, docs/tests/CI artifact names.
- Leave `repository.url` / bugs / homepage (and clone badges that must resolve today) on the **current** GitHub URL `…/vscode-markdown-workbench`.
- Run B1 old-token gate with allowlist entries for those still-valid old repo URLs.

**Phase 2 — immediately after merge:**

1. Rename the GitHub repository to `vscode-markdown-workshop`.
2. Update local remotes / any external CI that clones by URL.
3. Land a **tiny** metadata/docs commit on the new repo: `repository.url`, `bugs`, `homepage`, badges, clone URLs, remaining repo links.
4. Re-run the B1 gate; allowlist should shrink to historical notes only.

Alternative (also valid): rename GitHub after the implementation PR is approved but **before** merging, refresh the PR, and land phase-1+metadata against the new identity in one merge. Pick one path at implement time; do not mix them mid-PR.

---

## B6 — Cross-repo twin fixtures (light rule)

`docs/agent-handoff-format.md` and `test/fixtures/agent-handoff-format.json` stay **byte-identical** with PDF Workshop. There is no atomic cross-repo merge.

**Landing rule (pick one):**

- **A (preferred):** Land Markdown Workshop rename first (including any fixture text that must change). PDF Workshop PR pins / copies the same fixture bytes (same SHA) and lands the same day or immediately after; each CI asserts against its **checked-in** fixture, not the sibling’s moving `main`.
- **B:** Open both PRs with identical fixture commits (pinned SHAs agreed in advance) and merge both the same day.

Before either merge: verify byte equality of the twin files. After both land: verify again from both `main`s. Also search PDF Workshop for this extension’s **full old id**, command ids, and repo name — not only prose “Workbench”.

No multi-step process theater beyond the above.

---

## Implementation plan (for a later PR — not this docs PR)

Recommended order once implementation is approved:

1. **Constants first** — `SETTING_PREFIX`, `MARKDOWN_EDITOR.viewType`, `EXTENSION_ID` / `EXTENSION_FILTER`, bridge command constants, `generate-contributions.ts` prefix/category wiring; regenerate `package.json` contributes.
2. **Host façade rename** — `Workbench*` types/files → `Workshop*`; fix imports (symbol-aware).
3. **Bulk namespace replace** — `markdownWorkbench` → `markdownWorkshop` in tracked sources; full-id / `@ext:` / deep-link updates (B2).
4. **Package identity (phase 1)** — `package.json` `name`, VSIX naming in scripts/CI; **keep** repository URL fields on old GitHub name until phase 2 (B5).
5. **Docs prose** — remaining “Markdown Workbench” / `markdown-workbench` path refs; historical quotes → B1 allowlist, do not silently rewrite.
6. **Cross-repo handoff fixtures** — twin landing per B6.
7. **Verify** — `pnpm check`; package VSIX; B1 repo-wide `git grep` gate; B3 parity check; fresh-install smoke (B4); spot-check palette category, Open With viewType, settings search `markdownWorkshop`.
8. **Phase 2 GitHub cutover** — rename repo → metadata commit → re-run B1 (B5). **Not part of this docs PR.**

### B1 — Repo-wide negative verification (with allowlist)

After all generation and packaging scripts that rewrite tracked files, run on **tracked files** (not only `src`/`test`/contributes):

```text
git grep -n 'markdownWorkbench'
git grep -n 'vscode-markdown-workbench'
git grep -n 'MarkdownWorkbench'
git grep -n 'Markdown Workbench'
git grep -n 'markdown-workbench'
git grep -n 't04dj14n9.vscode-markdown-workbench'
```

Each hit must be either **zero** or on an **explicit reviewed allowlist**, e.g.:

- Single CHANGELOG / design “renamed from …” note.
- Historical session handoffs / old PR URLs quoted as history (do not rewrite).
- Phase-1 only: `repository.url` / bugs / homepage / badges still pointing at the pre-cutover GitHub name (removed in phase 2).

Do **not** add bare `Workbench` / `workbench` to this mechanical gate (hits VS Code built-ins and legitimate prose).

Optional follow-up (non-blocking for design): unpack the built VSIX and scan manifest + bundled JS for the same owned tokens.

### B3 — Manifest ↔ runtime parity (simple, not exhaustive)

Old-string absence ≠ new ids agree. Add a **small** check (unit test or script), not a contribution-point encyclopedia:

1. Every generated `contributes.commands[].command` is registered at runtime (same id string).
2. Every `contributes.customEditors[].viewType` matches the id passed to `registerCustomEditorProvider` / `MARKDOWN_EDITOR.viewType` (and other owned custom editors if any).
3. Owned context keys referenced in contributed `when` / `enablement` use the `markdownWorkshop.` prefix (no leftover `markdownWorkbench.`).

That is enough for v1. Do **not** require a full taxonomy of `setContext`, webview serializers, viewsWelcome, walkthroughs, etc. in this design — cover those opportunistically via the B1 grep gate when strings exist.

### Acceptance checks (implementation PR)

- B1 `git grep` gate clean except reviewed allowlist.
- B2 full-id / `@ext:` / deep-link consumers updated (or confirmed absent).
- B3 parity check green for commands + custom editor viewTypes.
- Extension id in VSIX manifest = `t04dj14n9.vscode-markdown-workshop`.
- Opening `*.md` with the custom editor uses `markdownWorkshop.editor`.
- No migration code paths; fresh-state policy (B4) documented and smoke-tested.
- Twin fixtures coordinated per B6 if handoff text changes.
- Phase-2 metadata commit planned/executed per B5 (may be a follow-up commit after repo rename).

## Risks / notes

- **Extension id change** installs as a **different** extension. Old local VSIX must be uninstalled; workspace `workbench.editorAssociations` values that pinned the old viewType must be edited by hand (acceptable: unpublished). Extension-private state resets (B4).
- Many open feature branches will conflict; prefer landing rename on `main` then rebasing feature work, or a short merge freeze.
- `Workbench` string has false positives (VS Code APIs). Prefer targeted replaces from constants + symbol-aware rename for product types over blind replace of `Workbench`.
- Sibling docs that still say “Agent PDF Viewer” should be updated when PDF Workshop rename lands; optional drive-by in this implementation only for strings that name **this** repo.
- Do not silently rewrite historical quotes of old PR URLs / commands into identities that did not exist then — allowlist them (B1).

## Approval

User approved complete rename scope (ids, package, repo, commands/settings, viewTypes, docs/tests/CSS where Workbench) with **no backward-compat** (2026-10-15). Display name already Markdown Workshop via #54. B1–B6 folded per author judgment above (2026-10-15 revision).
