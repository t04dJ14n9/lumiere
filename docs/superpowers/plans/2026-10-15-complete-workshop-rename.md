# Complete Workshop Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the breaking identity rename from Markdown Workbench → Markdown Workshop (extension id, package/VSIX name, contribution namespace, host façade, docs/tests/CI) with **no** backward-compat.

**Architecture:** Change identity at the constants + contribution generator first, lock B3 parity tests against the new ids, then symbol-aware façade rename, then owned-namespace / full-id bulk replace, then package/CSS/docs/tests/CI (phase 1 keeps old GitHub URLs). Verify with B1 grep gate + fresh-install smoke; coordinate twin handoff fixtures. GitHub repo rename is **phase 2 after merge** — not in the code PR.

**Tech Stack:** TypeScript VS Code extension, `pnpm`, `tsx scripts/generate-contributions.ts`, `vsce package`, node:test / existing `test/unit`.

**Spec:** `docs/superpowers/specs/2026-10-15-complete-workshop-rename-design.md` (APPROVED; ChatGPT B1–B6 @ `/workspace/plans/chatgpt-mw-rename-r2/ANSWER.md`)

## Global Constraints

- Complete rename; nothing published; **breaking OK**.
- Extension id → `t04dj14n9.vscode-markdown-workshop`
- Package / VSIX `name` → `vscode-markdown-workshop`
- Contribution namespace → `markdownWorkshop.*` (commands, settings, views, contexts, viewTypes)
- **No** aliases, dual ids, settings migrations, or state migration
- Do **not** rename VS Code built-ins (`workbench.editorAssociations`, `workbench.action.*`, `workbenchState`, generator `"workbench"` panel scope, etc.)
- Keep `mw-*` CSS classes
- Phase 1 keeps `repository.url` on `…/vscode-markdown-workbench`; phase 2 (post-merge) renames GitHub + metadata — **out of this code PR**
- Display name already “Markdown Workshop” (#54) — leave alone

---

## File map (phase-1 code PR)

| Area | Touch |
|---|---|
| Identity constants | `src/shared/setting-schema.ts`, `src/shared/editor-provider.ts`, `src/host/settings-access.ts`, `src/plugins/settings/commands.ts` |
| Generator | `scripts/generate-contributions.ts` → regenerates `package.json` `contributes` |
| Façade | `src/shared/runtime.ts` (`Workbench*` → `Workshop*`), `src/host/workbench.ts` → `workshop.ts`, `src/host/workbench-features.ts` → `workshop-features.ts`, `src/host/panel-adapter.ts`, all `createWorkbench*` / `ctx.workbench` call sites |
| API | `src/host/api/types.ts` (`MarkdownWorkbenchApi` → `MarkdownWorkshopApi` + id in docs), other `src/host/api/*` |
| Owned strings | `src/**`, `test/**`, plugin hosts (commands, viewTypes `graph` / `renderedDiff`, context keys, `@ext:`) |
| Package / CI | `package.json` `name` only in phase 1 (keep `repository.url`); workflows/scripts that assume VSIX basename |
| CSS/DOM | strings / data attrs `markdown-workbench` → `markdown-workshop`; leave `mw-*` |
| Docs / fixtures | README, API.md, CHANGELOG note, `docs/agent-handoff-format.md`, `test/fixtures/agent-handoff-format.json`, sample plugin |
| Gate | new small script + allowlist for B1 |
| Out of PR | GitHub rename; phase-2 URL/badge commit |

---

### Task 1: Identity constants + contribution generator

**Files:**
- Modify: `src/shared/setting-schema.ts` (`SETTING_PREFIX`)
- Modify: `src/shared/editor-provider.ts` (`MARKDOWN_EDITOR.viewType`)
- Modify: `src/host/settings-access.ts` (`EXTENSION_ID`)
- Modify: `src/plugins/settings/commands.ts` (`EXTENSION_FILTER`)
- Modify: `scripts/generate-contributions.ts` (every `` `markdownWorkbench.${…}` `` / `config.markdownWorkbench.` / when-prefix)
- Regenerate: `package.json` `contributes` only (do **not** change `name` / `repository` yet)

**Interfaces:**
- Produces: `SETTING_PREFIX = "markdownWorkshop."`; `MARKDOWN_EDITOR.viewType = "markdownWorkshop.editor"`; `EXTENSION_ID = "t04dj14n9.vscode-markdown-workshop"`; `EXTENSION_FILTER = "@ext:t04dj14n9.vscode-markdown-workshop"`; generated contributes all use `markdownWorkshop.*`

- [ ] **Step 1: Flip the four identity constants**

```ts
// src/shared/setting-schema.ts
export const SETTING_PREFIX = "markdownWorkshop.";

// src/shared/editor-provider.ts
viewType: "markdownWorkshop.editor",

// src/host/settings-access.ts
const EXTENSION_ID = "t04dj14n9.vscode-markdown-workshop";

// src/plugins/settings/commands.ts
export const EXTENSION_FILTER = "@ext:t04dj14n9.vscode-markdown-workshop";
```

- [ ] **Step 2: Update the generator prefix**

In `scripts/generate-contributions.ts`, replace owned `` markdownWorkbench. `` string templates with `` markdownWorkshop. `` (commands, view ids, menus, config keys, when-clauses). Leave the `whenEnabled(..., "workbench" | "editor")` **scope argument** alone — that is VS Code panel-vs-editor, not product identity.

- [ ] **Step 3: Regenerate contributes**

```bash
pnpm contributions
```

Expected: `package.json` `contributes.commands[].command`, `customEditors[].viewType` (`markdownWorkshop.editor`), configuration property keys, and when/enablement strings all use `markdownWorkshop.*`. `package.json` `name` still `vscode-markdown-workbench` for now.

- [ ] **Step 4: Sanity-check generator**

```bash
pnpm contributions --check
node -e "const p=require('./package.json'); const c=p.contributes; if(c.customEditors[0].viewType!=='markdownWorkshop.editor') process.exit(1); if(c.commands.some(x=>x.command.startsWith('markdownWorkbench.'))) process.exit(2); console.log('ok', c.commands.length)"
```

Expected: prints `ok` and command count (~102).

- [ ] **Step 5: Commit**

```bash
git add src/shared/setting-schema.ts src/shared/editor-provider.ts src/host/settings-access.ts src/plugins/settings/commands.ts scripts/generate-contributions.ts package.json
git commit -m "refactor(identity): Workshop constants and regenerated contributes"
```

---

### Task 2: B3 manifest ↔ runtime parity tests

**Files:**
- Create: `test/unit/identity/contribution-parity.test.ts` (or nearest existing identity/contrib test folder)
- Read: `package.json` contributes; `MARKDOWN_EDITOR`; plugin manifests under `src/plugins/*/manifest.ts`

**Interfaces:**
- Consumes: new ids from Task 1
- Produces: failing-until-later green checks that (1) every `contributes.commands[].command` uses `markdownWorkshop.` and matches the id the generator would build from manifests, (2) every `contributes.customEditors[].viewType` equals `MARKDOWN_EDITOR.viewType`, (3) contributed `when`/`enablement` strings have no `markdownWorkbench.` prefix

Interpret “registered at runtime” as: **the registration definition resolves to the same command id** (manifest id → `markdownWorkshop.${id}`), not that every optional plugin is enabled in one session.

- [ ] **Step 1: Write the parity test**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MARKDOWN_EDITOR } from "../../../src/shared/editor-provider";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const contributes = pkg.contributes;

test("customEditors viewType matches MARKDOWN_EDITOR", () => {
  const viewTypes = contributes.customEditors.map((e: { viewType: string }) => e.viewType);
  assert.deepEqual(viewTypes, [MARKDOWN_EDITOR.viewType]);
  assert.equal(MARKDOWN_EDITOR.viewType, "markdownWorkshop.editor");
});

test("contributed commands use markdownWorkshop. prefix only", () => {
  for (const c of contributes.commands) {
    assert.match(c.command, /^markdownWorkshop\./);
    assert.doesNotMatch(c.command, /markdownWorkbench/);
  }
});

test("owned when/enablement clauses do not use old prefix", () => {
  const blob = JSON.stringify(contributes);
  assert.equal(blob.includes("markdownWorkbench."), false);
});
```

Add a second assertion that rebuilds command ids from `src/plugins/*/manifest.ts` the same way the generator does (import `contributions()` from `scripts/generate-contributions.ts` if practical, or `pnpm contributions --check` as a companion script test). Prefer calling `contributions()` and deep-equal against `pkg.contributes` — that is the strongest cheap parity.

- [ ] **Step 2: Run the new test**

```bash
pnpm exec tsx --test test/unit/identity/contribution-parity.test.ts
```

Expected: PASS on contributes-derived asserts. (Full `pnpm check` will still fail until later tasks fix sources.)

- [ ] **Step 3: Commit**

```bash
git add test/unit/identity/contribution-parity.test.ts
git commit -m "test(identity): B3 contributes parity for markdownWorkshop ids"
```

---

### Task 3: Host façade rename (symbol-aware)

**Files:**
- Rename: `src/host/workbench.ts` → `src/host/workshop.ts`
- Rename: `src/host/workbench-features.ts` → `src/host/workshop-features.ts`
- Modify: `src/shared/runtime.ts` — `Workbench` → `Workshop`, `WorkbenchPanel` → `WorkshopPanel`; Context field `workbench` → `workshop`
- Modify: `src/host/panel-adapter.ts` — `createWorkbenchPanel` → `createWorkshopPanel`
- Modify: `src/host/workshop.ts` — `createWorkbench` → `createWorkshop`
- Modify: all imports / `ctx.workbench` / parameter names typed as the façade (`src/host/extension.ts`, `bootstrap.ts`, `views.ts`, `editor-panels.ts`, plugin hosts that take `Workbench`)
- Modify: `src/host/api/types.ts` — `MarkdownWorkbenchApi` → `MarkdownWorkshopApi`; doc example extension id
- Modify: other `src/host/api/*` and `test/fixtures/sample-plugin` / unit tests that import the old API name

**Do not** blind-replace bare `Workbench` / `workbench` (hits VS Code APIs and generator scope). Prefer IDE/ts rename or careful `rg`-guided edits on product symbols only.

**Interfaces:**
- Produces: `Workshop`, `WorkshopPanel`, `createWorkshop`, `createWorkshopPanel`, `ctx.workshop`, `MarkdownWorkshopApi`

- [ ] **Step 1: Rename types in `runtime.ts` and update Context**

```ts
export interface Workshop { /* was Workbench */ }
export interface WorkshopPanel { /* was WorkbenchPanel */ }
// Context services:
workshop: Workshop; // was workbench: Workbench
```

Update JSDoc examples that say `markdownWorkbench.*` settings to `markdownWorkshop.*`.

- [ ] **Step 2: Rename host modules + factories**

```bash
git mv src/host/workbench.ts src/host/workshop.ts
git mv src/host/workbench-features.ts src/host/workshop-features.ts
```

Inside: `export function createWorkshop(...)`; panel adapter `export function createWorkshopPanel(...)`. Fix imports (`from "./workshop"`, `from "./workshop-features"`).

- [ ] **Step 3: Propagate `ctx.workshop` and `MarkdownWorkshopApi`**

Update call sites that read `ctx.workbench` or pass `workbench: Workbench`. Rename API interface and all generics/`getExtension<…>` examples to `MarkdownWorkshopApi` + `t04dj14n9.vscode-markdown-workshop`.

- [ ] **Step 4: Typecheck host**

```bash
pnpm exec tsc -p src/host --noEmit
pnpm exec tsc -p src/plugins/tsconfig.host.json --noEmit
```

Expected: no remaining `Workbench` / `MarkdownWorkbenchApi` / `createWorkbench` product-symbol errors. Fix stragglers before continuing.

- [ ] **Step 5: Commit**

```bash
git add -A src/host src/shared/runtime.ts src/host/api test/fixtures/sample-plugin test/unit
git commit -m "refactor(host): Workbench façade → Workshop"
```

---

### Task 4: Owned namespace + full-id bulk replace (B2)

**Files:**
- Modify: remaining `src/**`, `test/**` string literals / comments for `markdownWorkbench` → `markdownWorkshop`
- Modify: full id / deep links / `@ext:` / `getExtension(...)` / sample `extensionDependencies` if any
- Modify: owned viewType strings still hard-coded (`markdownWorkbench.graph`, `markdownWorkbench.renderedDiff`, reclaim comments, cursorBridge context `markdownWorkbench.isCursorHost`, etc.)
- Skip: VS Code `workbench.*` keys; historical quotes (defer to allowlist in Task 6); `repository.url`; local checkout folder name

**Interfaces:**
- Consumes: constants from Task 1; façade from Task 3
- Produces: no owned `markdownWorkbench` / old full id in runtime sources & tests (docs swept in Task 5)

- [ ] **Step 1: Replace owned contribution namespace in sources/tests**

```bash
# Review hits first — do not pipe blind sed over the whole repo
git grep -n 'markdownWorkbench' -- src test scripts
```

Replace owned tokens with `markdownWorkshop`. Prefer editing through shared helpers already using `SETTING_PREFIX` / `MARKDOWN_EDITOR` where a literal is redundant.

- [ ] **Step 2: B2 full-id checklist**

Search and update (or confirm absent):

| Token | New |
|---|---|
| `t04dj14n9.vscode-markdown-workbench` | `t04dj14n9.vscode-markdown-workshop` |
| `@ext:t04dj14n9.vscode-markdown-workbench` | `@ext:t04dj14n9.vscode-markdown-workshop` |
| `vscode:extension/t04dj14n9.vscode-markdown-workbench` | `…markdown-workshop` |
| `vscode://t04dj14n9.vscode-markdown-workbench/` | `…markdown-workshop/` |

Audit: `getExtension` call sites, API.md examples, sample plugin, tests asserting `@ext:`.

- [ ] **Step 3: Spot-check dangerous false positives**

```bash
git grep -n 'workbench\.editorAssociations\|workbench\.action\|workbenchState\|whenEnabled(.*workbench' -- src scripts
```

Expected: those VS Code / generator-scope hits remain unchanged.

- [ ] **Step 4: Commit**

```bash
git add src test scripts
git commit -m "refactor(identity): markdownWorkshop namespace and full extension id"
```

---

### Task 5: Package name, CSS/DOM, docs, tests, CI (phase 1)

**Files:**
- Modify: `package.json` — `"name": "vscode-markdown-workshop"`; **keep** `"repository.url": "https://github.com/t04dJ14n9/vscode-markdown-workbench"`
- Modify: DOM/strings `markdown-workbench` → `markdown-workshop` (not `mw-*` classes)
- Modify: README / API.md / CAPABILITIES.md / DESIGN.md / prose “Markdown Workbench” → “Markdown Workshop”; package path refs
- Modify: CI / scripts only if they hard-code the old VSIX basename (vsce derives from `name`)
- Modify: CHANGELOG — short “renamed from …” note (this note stays on B1 allowlist)
- Do **not** update badges/clone URLs that must resolve today to the old GitHub name (allowlist)

- [ ] **Step 1: Flip package `name` only**

```json
"name": "vscode-markdown-workshop",
"repository": {
  "type": "git",
  "url": "https://github.com/t04dJ14n9/vscode-markdown-workbench"
}
```

- [ ] **Step 2: CSS/DOM owned strings**

```bash
git grep -n 'markdown-workbench' -- src test
```

Rename product DOM ids / data attrs / strings to `markdown-workshop`. Leave `mw-*` alone.

- [ ] **Step 3: Docs + test prose**

Update user-facing and developer docs. Do **not** silently rewrite historical session handoffs / old PR titles that quote the old identity — list them for the Task 6 allowlist instead.

- [ ] **Step 4: Package VSIX once for a name check**

```bash
pnpm package
ls -1 *.vsix
```

Expected: `vscode-markdown-workshop-<version>.vsix`. Unzip/`vsce` manifest name = `vscode-markdown-workshop`; publisher id pair = `t04dj14n9.vscode-markdown-workshop`.

- [ ] **Step 5: Commit**

```bash
git add package.json src test docs README.md CHANGELOG.md .github
git commit -m "refactor(identity): package name vscode-markdown-workshop (phase-1 URLs kept)"
```

---

### Task 6: B1 gate + allowlist + fresh-install smoke (B4)

**Files:**
- Create: `scripts/check-identity-rename.sh` (or `.mjs`) + `scripts/identity-rename-allowlist.txt`
- Document smoke steps in plan commit message / short `docs/` note if useful (no product migration code)

**B1 tokens (tracked files only):**

```text
markdownWorkbench
vscode-markdown-workbench
MarkdownWorkbench
Markdown Workbench
markdown-workbench
t04dj14n9.vscode-markdown-workbench
```

Do **not** gate bare `Workbench` / `workbench`.

Allowlist examples (reviewed):
- CHANGELOG / design “renamed from …” lines
- Historical handoff quotes
- Phase-1 `repository.url` / badges still on old GitHub name

- [ ] **Step 1: Write the gate script**

```bash
#!/usr/bin/env bash
set -euo pipefail
patterns=(
  'markdownWorkbench'
  'vscode-markdown-workbench'
  'MarkdownWorkbench'
  'Markdown Workbench'
  'markdown-workbench'
  't04dj14n9.vscode-markdown-workbench'
)
allowlist="${1:-scripts/identity-rename-allowlist.txt}"
fail=0
for p in "${patterns[@]}"; do
  while IFS= read -r hit; do
    file="${hit%%:*}"
    if ! grep -Fxq "$file" "$allowlist" 2>/dev/null; then
      # finer-grained: allowlist may list 'file:line' or 'file:pattern'
      if ! grep -Fq "$hit" "$allowlist" && ! grep -E "^${file}:" "$allowlist" | grep -Fq "$p"; then
        echo "B1 HIT: $hit"
        fail=1
      fi
    fi
  done < <(git grep -n "$p" || true)
done
exit "$fail"
```

Tighten matching to whatever is easiest to maintain (file-level allowlist is enough for v1). Seed `scripts/identity-rename-allowlist.txt` with phase-1 `package.json` repository URL and the CHANGELOG note path.

- [ ] **Step 2: Run B1 until clean**

```bash
bash scripts/check-identity-rename.sh
```

Expected: exit 0, or only allowlisted hits. Fix real stragglers; do not broaden allowlist without review.

- [ ] **Step 3: Re-run B3 + `pnpm check`**

```bash
pnpm check
```

Expected: format/lint/typecheck/unit/contributions --check green.

- [ ] **Step 4: Fresh-install smoke (B4) — manual / local VS Code**

1. Uninstall old VSIX `t04dj14n9.vscode-markdown-workbench` if present.
2. Install new `vscode-markdown-workshop-*.vsix`.
3. Activate once on a throwaway workspace (empty state OK).
4. Confirm: Open With → `markdownWorkshop.editor`; Settings search `markdownWorkshop`; command palette category “Markdown Workshop”; no migration prompts / no dual ids.

Policy reminder: **no** migration of `globalState` / `workspaceState` / secrets / `storageUri` / webview storage — reset is accepted.

- [ ] **Step 5: Commit gate + allowlist**

```bash
git add scripts/check-identity-rename.sh scripts/identity-rename-allowlist.txt
git commit -m "chore(identity): B1 old-token grep gate and phase-1 allowlist"
```

---

### Task 7: Twin agent-handoff fixtures (B6)

**Files:**
- Modify (if needed): `docs/agent-handoff-format.md`, `test/fixtures/agent-handoff-format.json`
- Coordinate: sibling `/workspace/repos/vscode-embedPDF` same two paths (PDF PR lands after or same day — not this PR’s merge)

**Landing rule (preferred A):** Land MW rename first (including fixture text). PDF PR copies the **same fixture bytes** and merges same day / immediately after. CI asserts against **checked-in** fixtures only.

- [ ] **Step 1: Update MW twin fixtures to Workshop naming**

Replace “Markdown Workbench” / old package id in those two files with Workshop identity. Keep the shared format contract intact.

- [ ] **Step 2: Record bytes for PDF**

```bash
sha256sum docs/agent-handoff-format.md test/fixtures/agent-handoff-format.json
```

Hand the hashes to the PDF rename PR. Before either merge: byte-identical twins. After both land: verify again from both `main`s.

Also search PDF repo for MW’s **full old id**, command ids, and repo name (cross-ref only).

- [ ] **Step 3: Commit**

```bash
git add docs/agent-handoff-format.md test/fixtures/agent-handoff-format.json
git commit -m "docs(handoff): Workshop naming in twin agent-handoff fixtures"
```

---

### Task 8: Phase-2 GitHub cutover (NOTE ONLY — not this PR)

**Out of scope for the implementation code PR.** After the phase-1 PR merges to `main`:

1. Rename GitHub `vscode-markdown-workbench` → `vscode-markdown-workshop`.
2. Update local remotes / external clone URLs.
3. Tiny metadata commit: `repository.url`, bugs, homepage, badges, remaining repo links.
4. Re-run B1; allowlist shrinks to historical notes only.

Alternative (also valid per spec): rename GitHub after PR approval but **before** merge, refresh the PR, land phase-1+metadata together. Pick one path at cutover time; do not mix mid-PR.

**Do not** perform the GitHub rename or phase-2 metadata commit as part of Tasks 1–7.

---

## Acceptance checklist (phase-1 PR)

- [ ] B3 parity test green (commands + `MARKDOWN_EDITOR` viewType; no old prefix in contributes)
- [ ] B2 full-id / `@ext:` / deep-link consumers updated or confirmed absent
- [ ] B1 gate clean except reviewed allowlist (includes phase-1 old `repository.url`)
- [ ] VSIX id = `t04dj14n9.vscode-markdown-workshop`; artifact `vscode-markdown-workshop-*.vsix`
- [ ] `pnpm check` green
- [ ] B4 fresh-install smoke done (uninstall old → install new → empty state OK)
- [ ] Twin fixtures updated; SHA handed to PDF rename; no cross-repo atomicity assumed
- [ ] **No** back-compat aliases / migrations
- [ ] Phase-2 GitHub rename **not** attempted in this PR

## Self-review (author)

1. **Spec coverage:** Tasks 1–7 map to design build order + B1–B4,B6; Task 8 records B5 without executing it.
2. **Placeholders:** none intentional — mechanical bulk replace is command-guided rather than a thousand pasted hunks.
3. **Type consistency:** `Workshop` / `WorkshopPanel` / `createWorkshop*` / `MarkdownWorkshopApi` / `markdownWorkshop.*` / `t04dj14n9.vscode-markdown-workshop` used throughout.
