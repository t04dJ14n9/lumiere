# AGENT.md — Developing a Markdown Workshop custom plugin

> Complementary to [AGENTS.md](AGENTS.md); does **not** replace it. Use this
> file for **user / third-party custom plugins**; use AGENTS.md when changing
> Markdown Workshop itself.

This file teaches an **external coding agent** (local Codex or a human) how to
build a **user / third-party plugin** that obeys Markdown Workshop’s extension
core. If you are changing Workshop itself (kernel, built-in `src/plugins/`,
webview), stop and read **AGENTS.md** instead.

**Routing (for maintainers / AGENTS.md):** If the task is a user / third-party
custom plugin, **read this AGENT.md** and implement it as a **separate VS Code
extension** — do **not** add it under `src/plugins/`. Root **AGENTS.md** carries
the same imperative bridge (Codex typically discovers AGENTS.md first).

---

## 0. One-sentence rule

A custom plugin is a **separate VS Code extension** (separate **extension
identity/package**, **not** a process sandbox) that activates Markdown
Workshop’s **Public API v1** and registers with `api.plugin({ … })`. It is
**not** a new folder under Workshop’s `src/plugins/`. The consumer and Workshop
must run in the **same Extension Host** (v1 supported scope: **local desktop**).

---

## 1. Mental model

| Kind | Where it lives | How it loads |
|------|----------------|--------------|
| Built-in feature/core | `src/plugins/<id>/` inside Workshop | Bundled; manifests → `package.json` via `pnpm contributions` |
| **Custom / third-party (you)** | Your own extension repo / folder | VS Code activates your extension → you call Workshop `api.plugin` |

Workshop’s editor webview stays **untrusted**. In API **v1**, your code runs in
the **Extension Host** as **your** extension identity. Multiple extensions often
**share one Extension Host process** — a separate extension is **not** its own
OS process or sandbox. You contribute **data and host callbacks** (markers,
actions, commands, sanitized code-block HTML/Markdown, link claims). You do
**not** inject scripts into the Live Preview webview.

**Same Extension Host:** Workshop’s exported API is available only to consumers
in the **same** Extension Host. Remote SSH / WSL / Containers / Codespaces can
split local vs remote hosts. **v1 supported path is local desktop.** Do not
claim remote support unless placement is aligned with Workshop’s real manifest
and proven. Looked up (do not invent): Workshop currently has `"main"` only —
**no** `"browser"`, **no** `"extensionKind"` in `package.json`.

Built-in shape (e.g. `wordCount`: `manifest.ts` + `host.ts`) is for Workshop
core contributors only. Copy the **sample external plugin** instead:

- In Workshop checkout: `test/fixtures/sample-plugin/` (**sole canonical template**)
- Walkthrough: [API.md](API.md) § External plugins and § Complete example
- Design: [DESIGN.md](DESIGN.md) §18

---

## 2. Prerequisites

- Markdown Workshop installed (or under development) with **API version 1**.
- Extension ID to depend on: `t04dj14n9.vscode-markdown-workbench`.
- Node.js tooling to bundle your extension (`esbuild` / `tsc` as you prefer).
- For packaging: `@vscode/vsce`.
- Local editor: VS Code or Cursor with
  `--extensionDevelopmentPath` / isolated `--user-data-dir` for safe trials
  (**local desktop** — v1 supported configuration).
- **Do not** plan on Cursor cloud agents for this workflow; use **local Codex**.

Read before coding:

1. This file (AGENT.md)
2. [API.md](API.md) (normative for v1)
3. Sample at `test/fixtures/sample-plugin/`

---

## 3. Quick start (agent checklist)

1. Create a new extension folder (or copy `test/fixtures/sample-plugin/`).
2. Set `publisher` + `name` → extension ID `publisher.name`.
3. In `package.json`:
   - `"extensionDependencies": ["t04dj14n9.vscode-markdown-workbench"]`
   - Activation: at least
     `"onLanguage:markdown"` and
     `"onCustomEditor:markdownWorkbench.editor"`
     (`onCustomEditor:<viewType>` is an **activation event**, not ownership of
     that custom editor — Workshop still owns the editor.)
   - Declare any commands under **your** `contributes.commands` (palette entries
     are yours; Workshop does not invent them).
   - Declare **`capabilities.untrustedWorkspaces`** deliberately (see §7.3).
     Samples: prefer `"supported": false`.
4. Obtain types from Workshop `dist/api/` (`types.d.ts`, `plugin-types.d.ts`, …)
   after `pnpm build` in Workshop, or copy those declarations into your repo.
5. In `activate`:
   - `const ext = vscode.extensions.getExtension<MarkdownWorkbenchApi>("t04dj14n9.vscode-markdown-workbench")`
   - `const api = await ext?.activate()`
   - Abort unless `api?.apiVersion === 1`
   - `context.subscriptions.push(api.plugin(yourDefinition))`
   - Note: with `extensionDependencies`, VS Code may prevent normal activation
     if Workshop is missing — your `apiVersion` guard covers the soft-fail path
     when activation still reaches your code; do not conflate the two.
6. Implement `ExternalPlugin` (`id`, `ownerExtensionId`, `title`, `description`,
   `defaultEnabled`, `inject`, `apply`).
   - **`ownerExtensionId` MUST equal your own exact extension id**
     (`publisher.name`).
7. Run locally on **local desktop** (see §8). Verify Show Plugin Status lists
   your plugin.
8. Toggle `"markdownWorkbench.plugins.external": { "<your.id>": false }` and
   confirm contributions disappear.

**Settings namespace:** use `markdownWorkbench.*` (current product namespace). If
the product formally renames to `markdownWorkshop.*`, update this file in
**lockstep** with API.md — do not invent the rename early.

---

## 4. Plugin definition rules

```ts
api.plugin({
  id: "acme.badges",                 // publisher.* ; /[\w.-]{3,200}/
  ownerExtensionId: "acme.badges", // MUST equal YOUR exact extension id (publisher.name)
  title: "Badges",
  description: "…",
  defaultEnabled: true,
  inject: {
    required: ["editors", "markers"], // PublicServices keys only
    optional: ["vault"],
  },
  apply(ctx) {
    // register only through ctx; undone on stop
  },
});
```

Hard rules:

- `id` starts with the owner **publisher** and a dot; must not collide with
  built-ins or another registered external id (`DuplicateContribution`).
- **`ownerExtensionId` MUST equal the author’s own exact VS Code extension ID**
  (`publisher.name`). Workshop verifies the id is installed / consistent enough
  for **anti-confusion / collision** checks — this is **not authentication**
  and does not prove the caller is trustworthy.
- Namespaces prevent accidents; they **do not authenticate** other extensions.
- `inject` lists every public service you read. Anything else throws
  `UndeclaredService`. Internal Workshop services are not exposed through the supported Public API/plugin context.
- `apply` may be async. Failure → plugin state `failed` (see Show Plugin
  Status); do not crash Workshop.
- Push the returned `PluginHandle` onto `context.subscriptions`. `dispose()`
  unregisters and tears down effects.

Enablement:

- Setting map: `markdownWorkbench.plugins.external`
- Example: `{ "acme.badges": false }`
- Scopes: user / workspace / workspace folder (via API
  `setPluginEnabled` / Settings UI **Manage Plugins**)
- If unset → `defaultEnabled`

---

## 5. Lifecycle

```text
register (api.plugin)
    → catalog entry
    → enablement? ──no──► disabled
         │ yes
         ▼
      start fiber (pending → active | failed)
         │
         ▼
      apply(ctx) registrations live
         │
 disable / dispose / owner deactivated
         │
         ▼
      stop: effects disposed; markers/actions/processors cleared
      retained ctx → PluginDisabled
```

States you will see: `active`, `loading` / `pending` (waiting for required
services), `failed`, `disabled`. Use `handle.settled()` to wait for a
transition in tests.

---

## 6. Public services and events (API v1)

Only these (declare in `inject`):

| Service | Use |
|---------|-----|
| `editors` | `getEditors`, `getActiveEditor`, `open`, `reveal`, `getSelection`, `registerTitleAction`, `registerSelectionAction` |
| `vault` | `resolveLink`, `getMetadata`, `getBacklinks`, `onDidResolveLinks` (read-only) |
| `markers` | `set`, `clear`, `registerAction` — badges on note ranges |
| `commands` | `register(id, run)` — `id` must start with your extension id |
| `codeBlocks` | `register({ language, render })` — returns `{ markdown }` **or** `{ html }`; sanitized; **trusted workspaces only** (Workshop gate) |
| `logger` | `debug` / `warn` / `error` → Markdown Workshop output channel |

Always available on context (not via inject list semantics beyond docs): `on`,
`effect` — treat them as part of the external context contract in API.md.

Events via `ctx.on`:

| Event | Role |
|-------|------|
| `editor/opened` | Refresh per-editor contributions |
| `editor/closed` | Drop per-editor state |
| `editor/activeChanged` | |
| `editor/selectionChanged` | |
| `links/open` | Return `true` to claim; first claim wins (built-ins first, then external by id) |

`ctx.effect(create)` owns disposables (e.g. `workspace.onDidChangeTextDocument`)
and disposes them when the plugin stops.

Markers (summary):

- Offsets are UTF-16 source offsets counting CR in CRLF (same as
  `TextDocument.offsetAt`), tied to `documentVersion`.
- ≤ 1000 markers per plugin per editor; label ≤ 120 chars.
- Prefer recomputing on document change.

Errors: `EditorNotFound`, `InvalidArgument`, `PluginDisabled`, `StaleSelection`,
`DuplicateContribution`, `UndeclaredService`, `WorkspaceUntrusted`, …

Normative detail: **API.md**. Do not invent members.

---

## 7. Constraints and security (obey the core)

### 7.1 Trust layers

| Layer | Meaning |
|-------|---------|
| **L0** Workshop built-ins | First-party; full kernel |
| **L1** Your extension | Full `vscode.*` available to **your** extension identity (often shared Extension Host with other extensions); Workshop only exposes `PublicServices` inside `apply` |
| **L2** Editor webview | Untrusted; your v1 plugin never runs there |

Workshop’s isolation stops you from touching **internal** services and from
running in the webview. It does **not** sandbox your extension from the rest of
VS Code, and it does **not** give you a private process. Treat third-party
plugins as **untrusted relative to Workshop core**: users should install
extensions they trust. There is **no** Workshop first-run permission UI for
external plugins — rely on VS Code’s install / Workspace Trust UX.

### 7.2 Same Extension Host

- Obtain Workshop’s API only when your extension and Workshop run in the
  **same Extension Host**.
- **v1:** develop and test on **local desktop**.
- Remote windows can place extensions on different hosts; the exported API then
  fails even with `extensionDependencies`. Do not invent Workshop’s
  `extensionKind`; align only with its real manifest if remote support is
  designed later.

### 7.3 Your extension’s Workspace Trust contract

Workshop’s code-block processor gate (off in untrusted workspaces) is
**defense in depth**. It does **not** replace **your** extension’s trust
declaration.

Authors **must** set `capabilities.untrustedWorkspaces` deliberately:

| Choice | When |
|--------|------|
| `"supported": false` | **Conservative default for samples / most plugins** — extension disabled in Restricted Mode |
| `"supported": "limited"` | Only if you intentionally support Restricted Mode **and** gate trust-sensitive behavior |
| `"supported": true` | Only if fully safe in Restricted Mode **and** you still gate anything sensitive |

If you choose `limited` or `true`, you **must** gate your own trust-sensitive
behavior (`vscode.workspace.fs`, spawning processes, interpreting workspace
configuration, network, etc.). Do not rely on Workshop’s processor gate alone.

Optional: use `restrictedConfigurations` for settings that must not apply in
Restricted Mode (see VS Code Workspace Trust extension guide).

### 7.4 Do not

- Add or edit files under Workshop `src/plugins/` for a third-party feature.
- Dynamic-import or `eval` vault / workspace scripts into Workshop.
- Bundle or expect API v2 webview modules (`markdownWorkbench.webviewPlugins`)
  — designed, not the v1 custom-plugin path.
- Register custom editors through Workshop API v1 (that is P7 / API v2 editor
  plugins — separate design). Using `onCustomEditor:markdownWorkbench.editor`
  only **activates** your extension when that editor opens; it does not make
  you the editor owner.
- Change Markdown parsing / CodeMirror extensions from outside.
- Write note text through secret Workshop APIs; use VS Code `WorkspaceEdit` /
  `TextDocument` so the editor follows the document.
- Use command IDs outside your extension id prefix.
- Set `ownerExtensionId` to someone else’s extension id.
- Rely on undocumented Workshop internals or non-frozen objects (API returns
  are frozen).
- Claim a “fully automated E2E custom-plugin flow” from unit + manual alone
  (see §9).

---

## 8. Packaging and local run

### Development (primary local-Codex loop)

```sh
# From your plugin folder (example)
npm run compile   # or your bundler → dist/extension.js

code --user-data-dir /tmp/mdwb-plugin-dev/user \
  --extensions-dir /tmp/mdwb-plugin-dev/extensions \
  --extensionDevelopmentPath /path/to/your-plugin \
  /path/to/a/markdown/vault
```

Install or also develop Markdown Workshop into the **same local profile** first
(VSIX or second `--extensionDevelopmentPath` as your tooling allows) so they can
run together locally; both must ultimately resolve to the **same Extension Host**.
The canonical v1 consumer/sample is a Node-host extension with a `main` entry.

In-repo sample build (Workshop root):

```sh
pnpm sample
# then package or extensionDevelopmentPath against test/fixtures/sample-plugin
```

### VSIX

```sh
npx @vscode/vsce package --no-dependencies --allow-missing-repository --skip-license
code --install-extension your-plugin-0.0.1.vsix
```

Marketplace publish is optional and owner-gated for Workshop itself; your
plugin’s publish policy is yours.

---

## 9. What “done” means (agent acceptance)

Before claiming a custom plugin works (**API / lifecycle + manual integration**):

1. Soft-fail when Workshop API is unreachable from your `activate` path
   (`apiVersion` guard / missing export). Separately understand that
   `extensionDependencies` may prevent normal activation if Workshop is not
   installed — that is VS Code behavior, not the same as your guard.
2. Plugin appears in **Markdown Workshop: Show Plugin Status** / catalog
   (same local Extension Host).
3. At least one trivial contribution works (marker **or** command **or**
   claimed link **or** code-block language). Prefer proving **command + marker**
   when aiming at native E2E later.
4. Disable via `markdownWorkbench.plugins.external` removes the contribution
   without breaking built-ins.
5. Re-enable restores it.
6. Disposing the handle / deactivating the extension cleans up.
7. No imports of Workshop internals; only public types + `vscode`.
8. Commands declared in **your** `package.json` if they should show in the
   palette.
9. `capabilities.untrustedWorkspaces` declared deliberately; samples default
   `false`; `limited`/`true` gate trust-sensitive behavior.
10. `ownerExtensionId` equals your exact `publisher.name`.
11. If you added automated tests in Workshop’s repo for a fixture: prefer
    **unit** tests; do not add `test/vscode` / browser cases unless the owner
    explicitly approved (see AGENTS.md testing policy).

**Claim language:**

- Unit + manual = **API/lifecycle coverage + manual integration acceptance**.
- Do **not** claim a **fully automated E2E custom-plugin flow** until an
  owner-approved native `test/vscode` smoke exists (real activation, API
  discovery, command + marker, enable/disable, teardown). Architecture approval
  does **not** require that native suite to exist yet.

---

## 10. Out of scope (do not implement under this AGENT.md)

- Built-in plugins and contribution generation (`pnpm contributions`)
- API v2 webview modules (DESIGN §18.5) — unrelated future path
- External **editor** plugins / Manage File Types registration (P7) —
  unrelated future path
- Workspace-folder plugin loaders (Approach B as defined — permanently rejected)
- Claiming remote SSH/WSL/Containers custom-plugin support in v1
- Changing Workshop kernel, lint rules, or AGENTS.md norms (except the
  one-line AGENT.md routing sentence already in AGENTS.md)
- Pushing or publishing Workshop
- Workshop first-run permission UI for external plugins

---

## 11. Pointers

| Doc | Why |
|-----|-----|
| [API.md](API.md) | Normative Public API v1 |
| [DESIGN.md](DESIGN.md) §18–§19 | Architecture + security |
| [AGENTS.md](AGENTS.md) | Workshop **core** agent rules (not plugin authors); must route custom-plugin tasks here |
| `test/fixtures/sample-plugin/` | Canonical minimal extension (sole template for now) |
| `docs/MANUAL_TEST_PLAN.md` § External plugins | Human acceptance script |

---

## 12. Relationship statement (for maintainers)

- **AGENTS.md** = how to develop Markdown Workshop.
- **AGENT.md** = how to develop a plugin that **uses** Markdown Workshop.
- Keep both. Cross-link; never merge into one file without an explicit owner
  decision.
- **AGENTS.md must** contain an imperative routing sentence pointing custom /
  third-party plugin work at this file (discovery bridge for local Codex).
