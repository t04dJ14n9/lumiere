# Complete Workshop Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the breaking identity rename from Markdown Workbench → Markdown Workshop (extension id, package/VSIX name, contribution namespace, host façade, docs/tests/CI) with **no** backward-compat.

**Architecture:** Change identity at the constants + contribution generator first (including a shared contribution-id helper), lock **B3** tests that assert **runtime registration ids / viewTypes ↔ manifest** (not generator self-consistency alone), then symbol-aware façade rename, then owned-namespace / full-id bulk replace, then package/CSS/docs/tests/CI (phase 1 keeps old GitHub URLs). Verify with B1 grep gate (**occurrence-scoped** allowlist) + fresh-install smoke; coordinate twin handoff fixtures; **re-run B1 + B3 + `pnpm check` after the Task 7 fixture commit**. GitHub repo rename is **phase 2 after merge** — not in the code PR.

**Tech Stack:** TypeScript VS Code extension, `pnpm`, `tsx scripts/generate-contributions.ts`, `vsce package`, node:test / existing `test/unit`.

**Spec:** `docs/superpowers/specs/2026-10-15-complete-workshop-rename-design.md` (APPROVED; ChatGPT B1–B6 @ `/workspace/plans/chatgpt-mw-rename-r2/ANSWER.md`)

**Plan revision:** folds ChatGPT implementation-plan REQUEST CHANGES (`/workspace/plans/chatgpt-mw-rename-plan/ANSWER.md`) — plan-B1 runtime↔manifest B3 parity, plan-B2 occurrence-scoped B1 allowlist, plan-B3 re-verify after Task 7. Non-blocking Task-2 wording inconsistency resolved by the B3 rewrite.

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
| Gate | new small script + **occurrence-scoped** allowlist for B1 |
| Out of PR | GitHub rename; phase-2 URL/badge commit |

---

### Task 1: Identity constants + contribution generator

**Files:**
- Modify: `src/shared/setting-schema.ts` (`SETTING_PREFIX` + shared `contributionId`)
- Modify: `src/shared/editor-provider.ts` (`MARKDOWN_EDITOR.viewType`)
- Modify: `src/host/settings-access.ts` (`EXTENSION_ID`)
- Modify: `src/plugins/settings/commands.ts` (`EXTENSION_FILTER`)
- Modify: `scripts/generate-contributions.ts` (use `contributionId` / `SETTING_PREFIX`; no hard-coded `` `markdownWorkbench.${…}` ``)
- Regenerate: `package.json` `contributes` only (do **not** change `name` / `repository` yet)

**Interfaces:**
- Produces: `SETTING_PREFIX = "markdownWorkshop."`; `contributionId(localId)` → `` `markdownWorkshop.${localId}` `` (same module as `SETTING_PREFIX`, or a tiny adjacent export); `MARKDOWN_EDITOR.viewType = "markdownWorkshop.editor"`; `EXTENSION_ID = "t04dj14n9.vscode-markdown-workshop"`; `EXTENSION_FILTER = "@ext:t04dj14n9.vscode-markdown-workshop"`; generated contributes all use `markdownWorkshop.*`

- [ ] **Step 1: Flip identity constants + add shared contribution id helper**

```ts
// src/shared/setting-schema.ts
export const SETTING_PREFIX = "markdownWorkshop.";

/** Full contributed command / view / context id from a local suffix. */
export function contributionId(localId: string): string {
  return `${SETTING_PREFIX}${localId}`;
}

// src/shared/editor-provider.ts
viewType: "markdownWorkshop.editor",

// src/host/settings-access.ts
const EXTENSION_ID = "t04dj14n9.vscode-markdown-workshop";

// src/plugins/settings/commands.ts
export const EXTENSION_FILTER = "@ext:t04dj14n9.vscode-markdown-workshop";
```

Generator **and** runtime command/view registration must both call `contributionId` (or read `MARKDOWN_EDITOR.viewType`) — do not leave independent `` `markdownWorkbench.${…}` `` / `` `markdownWorkshop.${…}` `` string templates in registration paths.

- [ ] **Step 2: Update the generator to use the helper**

In `scripts/generate-contributions.ts`, replace owned `` markdownWorkbench. `` string templates with `contributionId(...)` / `SETTING_PREFIX` (commands, view ids, menus, config keys, when-clauses). Leave the `whenEnabled(..., "workbench" | "editor")` **scope argument** alone — that is VS Code panel-vs-editor, not product identity.

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

### Task 2: B3 manifest ↔ runtime registration parity tests

**Files:**
- Create: `test/unit/identity/contribution-parity.test.ts` (or nearest existing identity/contrib test folder)
- Modify: runtime registration call sites that still build ids with independent templates — at least `src/plugins/commands/features.ts`, `src/plugins/commands/host.ts`, `src/plugins/editor/jump-host.ts`, `src/plugins/editor/actions-host.ts`, `src/plugins/settings/host.ts`, `src/plugins/editor/associations.ts`, `src/plugins/livePreview/host.ts`, `src/host/api/management.ts` (and any other `ctx.workbench.command(\`markdownWorkbench.${…}\`)` / hard-coded owned command id)
- Read: `package.json` contributes; `MARKDOWN_EDITOR`; `contributionId` / `SETTING_PREFIX`; plugin manifests under `src/plugins/*/manifest.ts`

**What B3 is (and is not):**
- **Is:** every generated `contributes.commands[].command` agrees with the **id string actually passed** to runtime command registration; every `contributes.customEditors[].viewType` agrees with the id passed to `registerCustomEditorProvider` / `MARKDOWN_EDITOR.viewType`.
- **Is not:** deep-equality of `contributions()` against `pkg.contributes` alone, or “rebuild ids the same way the generator does” without touching runtime. Those are generator self-checks — useful smoke, **insufficient for B3**.

**Preferred mechanism (keep small):** shared `contributionId` from Task 1 used by **both** generator and runtime registration. Optionally record ids through a test double of `workbench.command` / `views.command` when invoking known `register*` helpers — compare the captured set to `contributes.commands[].command`. Do **not** instantiate every optional plugin or write a contribution taxonomy.

**Interfaces:**
- Consumes: `contributionId`, `MARKDOWN_EDITOR`, regenerated contributes from Task 1
- Produces: green B3 asserts that fail if runtime still registers `markdownWorkbench.*` (or any id divergent from contributes)

- [ ] **Step 1: Point runtime registration at `contributionId` / `MARKDOWN_EDITOR`**

Replace independent templates at registration sites:

```ts
// before
ctx.workbench.command(`markdownWorkbench.${command.id}`, ...)
// after
ctx.workbench.command(contributionId(command.id), ...)
```

Custom editor path already registers `provider.viewType` — confirm that path is fed by `MARKDOWN_EDITOR.viewType` (Task 1). Other owned viewTypes (`graph`, `renderedDiff`, …) must likewise come from the same helper/constant the generator emits — no parallel literals.

Remaining non-registration string literals can wait for Task 4; **registration-id derivation must not**.

- [ ] **Step 2: Write the B3 parity test (runtime ↔ manifest)**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MARKDOWN_EDITOR } from "../../../src/shared/editor-provider";
import { contributionId, SETTING_PREFIX } from "../../../src/shared/setting-schema";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const contributes = pkg.contributes;

test("customEditors viewType matches MARKDOWN_EDITOR (runtime registration id)", () => {
  const viewTypes = contributes.customEditors.map((e: { viewType: string }) => e.viewType);
  assert.deepEqual(viewTypes, [MARKDOWN_EDITOR.viewType]);
  assert.equal(MARKDOWN_EDITOR.viewType, contributionId("editor"));
});

test("every contributed command id equals contributionId(local) and uses Workshop prefix", () => {
  for (const c of contributes.commands) {
    assert.match(c.command, /^markdownWorkshop\./);
    assert.doesNotMatch(c.command, /markdownWorkbench/);
    const local = c.command.slice(SETTING_PREFIX.length);
    assert.equal(c.command, contributionId(local));
  }
});

test("owned when/enablement clauses do not use old prefix", () => {
  const blob = JSON.stringify(contributes);
  assert.equal(blob.includes("markdownWorkbench."), false);
});
```

Add a **runtime capture** (or equivalent) assert — this is the part that closes B3:

- Stub/fake `workbench.command` / `views.command` to push each `id` into a `Set`.
- Invoke the known host registration helpers (palette actions, feature-command loop, settings host, jump/actions hosts, etc.) with minimal fixtures/manifests.
- Assert: every captured id is in `contributes.commands[].command`, and every contributed command that those helpers are responsible for appears in the captured set.
- Alternatively (also acceptable): a focused unit/source assert that registration modules import `contributionId` and have **zero** remaining `` `markdownWorkbench.${ `` / `` `markdownWorkshop.${ `` templates (helper-only construction). Prefer the capture test when cheap.

Optional companion: `pnpm contributions --check` / `contributions()` deep-equal — **label it generator smoke**, not B3.

- [ ] **Step 3: Run the new test — expect PASS after Step 1**

```bash
pnpm exec tsx --test test/unit/identity/contribution-parity.test.ts
```

Expected: **PASS** on viewType + runtime command-id parity. Do **not** call this done if only the generator self-check is green while runtime still templates old/divergent ids. (Full `pnpm check` may still fail until later tasks fix remaining sources.)

- [ ] **Step 4: Commit**

```bash
git add test/unit/identity/contribution-parity.test.ts \
  src/plugins/commands/features.ts src/plugins/commands/host.ts \
  src/plugins/editor/jump-host.ts src/plugins/editor/actions-host.ts \
  src/plugins/settings/host.ts src/plugins/editor/associations.ts \
  src/plugins/livePreview/host.ts src/host/api/management.ts \
  src/shared/setting-schema.ts
git commit -m "test(identity): B3 runtime command/viewType parity with contributes"
```

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

Allowlist rules (**occurrence-scoped**, not whole-file):
- Each entry exempts **one reviewed token occurrence** in one file — format `path<TAB>exact-substring`.
- A `git grep` hit fails unless the hit line contains an allowlisted substring **for that same file** and the matched old token lies inside that substring (so other stale tokens in the same file still fail).
- **Do not** whole-file allowlist `package.json` (or any critical file). Phase-1 may permit only the old GitHub URL substring; a stray old command id / package `name` / extension id in the same file must still fail B1.
- Examples (reviewed): CHANGELOG / design “renamed from …” lines; historical handoff quotes; phase-1 `repository.url` / badges still on the old GitHub name — each as its own `path<TAB>substring` row.

- [ ] **Step 1: Write the gate script (token/occurrence-scoped allowlist)**

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
allowed_in_file() {
  local file="$1" line="$2" pat="$3"
  local afile atoken
  while IFS=$'\t' read -r afile atoken; do
    [[ -z "${afile:-}" || "$afile" =~ ^# ]] && continue
    [[ "$afile" == "$file" ]] || continue
    [[ "$line" == *"$atoken"* ]] || continue
    # Exempt only when this allowlisted substring is what justifies the hit.
    [[ "$atoken" == *"$pat"* ]] || continue
    return 0
  done < "$allowlist"
  return 1
}
for p in "${patterns[@]}"; do
  while IFS= read -r hit; do
    file="${hit%%:*}"
    rest="${hit#*:}"
    line="${rest#*:}"   # after line number
    if ! allowed_in_file "$file" "$line" "$p"; then
      echo "B1 HIT: $hit"
      fail=1
    fi
  done < <(git grep -n "$p" || true)
done
exit "$fail"
```

Seed `scripts/identity-rename-allowlist.txt` with **occurrence** rows only, e.g.:

```text
package.json	https://github.com/t04dJ14n9/vscode-markdown-workbench
CHANGELOG.md	renamed from Markdown Workbench
```

Whole-file allowlisting is **rejected** for v1.

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

- [ ] **Step 4: Final verification on phase-1 HEAD (order fix)**

Task 6 ran B1 / `pnpm check` **before** this fixture commit. Re-verify the **final** branch tip so executed HEAD matches what passed the gates:

```bash
bash scripts/check-identity-rename.sh
pnpm exec tsx --test test/unit/identity/contribution-parity.test.ts
pnpm check
sha256sum docs/agent-handoff-format.md test/fixtures/agent-handoff-format.json
```

Expected: B1 clean (occurrence allowlist only); B3 runtime↔manifest parity green; `pnpm check` green; twin-fixture hashes recorded for PDF match the committed bytes. Fresh-install smoke (B4) need **not** be repeated unless this task somehow touched packaged/runtime content (it should not).

If anything fails, fix and commit again — do not treat Task 6’s earlier green as final.

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

- [ ] B3 parity test green: **runtime** command ids + `MARKDOWN_EDITOR` / custom editor viewTypes agree with contributes (not generator-only self-check)
- [ ] B2 full-id / `@ext:` / deep-link consumers updated or confirmed absent
- [ ] B1 gate clean except **occurrence-scoped** reviewed allowlist (phase-1 old `repository.url` substring only — not whole-file `package.json`)
- [ ] VSIX id = `t04dj14n9.vscode-markdown-workshop`; artifact `vscode-markdown-workshop-*.vsix`
- [ ] `pnpm check` green on **final** HEAD (re-run after Task 7 fixture commit)
- [ ] B4 fresh-install smoke done (uninstall old → install new → empty state OK)
- [ ] Twin fixtures updated; SHA handed to PDF rename; hashes re-confirmed after Task 7; no cross-repo atomicity assumed
- [ ] **No** back-compat aliases / migrations
- [ ] Phase-2 GitHub rename **not** attempted in this PR

## Self-review (author)

1. **Spec coverage:** Tasks 1–7 map to design build order + B1–B4,B6; Task 8 records B5 without executing it. ChatGPT plan review B1–B3 folded: runtime B3 parity, occurrence-scoped allowlist, post–Task-7 verify.
2. **Placeholders:** none intentional — mechanical bulk replace is command-guided rather than a thousand pasted hunks.
3. **Type consistency:** `Workshop` / `WorkshopPanel` / `createWorkshop*` / `MarkdownWorkshopApi` / `contributionId` / `markdownWorkshop.*` / `t04dj14n9.vscode-markdown-workshop` used throughout.
