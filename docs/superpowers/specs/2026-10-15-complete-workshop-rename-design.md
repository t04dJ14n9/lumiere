# Complete rename: Markdown Workbench → Markdown Workshop

Date: 2026-10-15  
Status: draft for review (design only — no implementation yet)  
Repo (current): `t04dJ14n9/vscode-markdown-workbench`  
Branch for this doc: `docs/complete-workshop-rename`  
Related: PR #54 already shipped **display name** “Markdown Workshop”; this spec finishes the identity rename.

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
- Renaming VS Code built-ins that contain the word “workbench” (e.g. `workbench.editorAssociations`, `workbench.action.*`).
- Changing product behavior unrelated to identity strings.
- Renaming the sibling PDF extension (separate spec); only update **cross-references** that name this extension.

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

Authoritative contribution constants today:

- `MARKDOWN_EDITOR.viewType` = `markdownWorkbench.editor` (`src/shared/editor-provider.ts`)
- `SETTING_PREFIX` = `markdownWorkbench.` (`src/shared/setting-schema.ts`)
- Manifest command ids are **unprefixed** in plugin manifests; the generator adds `markdownWorkbench.`

## Proposed new identity map

### Packaging / hosting

| Kind | New value |
|---|---|
| Publisher (unchanged) | `t04dj14n9` |
| Full extension id | `t04dj14n9.vscode-markdown-workshop` |
| npm / VSIX `name` | `vscode-markdown-workshop` |
| VSIX artifact | `vscode-markdown-workshop-<version>.vsix` |
| GitHub | `https://github.com/t04dJ14n9/vscode-markdown-workshop` |
| `package.json` `repository.url` / bugs / homepage | Update to new repo URL when repo is renamed |

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

Comments that mean “VS Code workbench” stay as “workbench”.

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
- Agent handoff / bridge docs that still say Workbench or old package id; keep **byte-identical fixture policy** with PDF Workshop by updating **both** repos in the same rename window (see cross-repo).

### Explicitly out of rename

- VS Code keys: `workbench.editorAssociations`, `workbench.colorCustomizations`, etc.
- Third-party / upstream names.
- Git history / old PR titles (leave as historical).
- Local folder checkouts named `vscode-markdown-workbench` until operators rename them (document only).

## Implementation plan (for a later PR — not this docs PR)

Recommended order once implementation is approved:

1. **Constants first** — `SETTING_PREFIX`, `MARKDOWN_EDITOR.viewType`, bridge command constants, `generate-contributions.ts` prefix/category wiring; regenerate `package.json` contributes.
2. **Host façade rename** — `Workbench*` types/files → `Workshop*`; fix imports.
3. **Bulk namespace replace** — `markdownWorkbench` → `markdownWorkshop` in `src/`, `test/`, generated contributes; verify with `rg`.
4. **Package identity** — `package.json` `name`, repository fields, VSIX naming in scripts/CI.
5. **Docs prose** — remaining “Markdown Workbench” / `markdown-workbench` path refs.
6. **Cross-repo handoff fixtures** — coordinate with PDF Workshop rename so `agent-handoff-format` fixtures stay twin-identical if that policy remains.
7. **Verify** — `pnpm check`, package VSIX, spot-check command palette category, Open With viewType, settings search `markdownWorkshop`.
8. **GitHub repo rename** — separate operator step after the code PR is on `main` (or immediately after merge, with remote URL updates). **Not part of this docs PR.**

### Acceptance checks (implementation PR)

- `rg 'markdownWorkbench'` → empty in `src`/`test`/contributes (allow listed historical docs if any).
- `rg 'vscode-markdown-workbench'` → empty except changelog “renamed from” note if desired.
- Extension id in VSIX manifest = `t04dj14n9.vscode-markdown-workshop`.
- No `activationEvents` / menus still pointing at old ids.
- Opening `*.md` with the custom editor uses `markdownWorkshop.editor`.
- No migration code paths.

## Risks / notes

- **Extension id change** installs as a **different** extension. Old local VSIX must be uninstalled; workspace `workbench.editorAssociations` values that pinned the old viewType must be edited by hand (acceptable: unpublished).
- Many open feature branches will conflict; prefer landing rename on `main` then rebasing feature work, or a short merge freeze.
- `Workbench` string has false positives (VS Code APIs). Prefer targeted replaces from constants + codemod for `markdownWorkbench` over blind replace of `Workbench`.
- Sibling docs that still say “Agent PDF Viewer” should be updated when PDF Workshop rename lands; optional drive-by in this implementation only for strings that name **this** repo.

## Approval

User approved complete rename scope (ids, package, repo, commands/settings, viewTypes, docs/tests/CSS where Workbench) with **no backward-compat** (2026-10-15). Display name already Markdown Workshop via #54.
