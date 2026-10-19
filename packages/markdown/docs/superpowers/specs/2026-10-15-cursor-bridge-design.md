# cursorBridge v1 — design

Date: 2026-10-15  
Status: approved for implementation (Pro REQUEST CHANGES; B1–B3 incorporated)  
Repo: `vscode-markdown-workbench`  
Plugin id: `cursorBridge`  
Owner-approved product lock (2026-10-15): Cmd+L → Cursor Chat with MW selection;
Cmd+K → Cursor Edit with selection; **native Cursor apply**; selection via
`api.getSelection`; **Cursor-host only**; leave `agentBridge` alone; out of
scope v1: apply-back, PDF, whole-file without selection.

Pro review: `docs/superpowers/specs/pro-answer.md` (verdict REQUEST CHANGES;
Q1–Q5 answered). Blocking fixes B1–B3 are required below.

## Goal

When Markdown Workbench runs **inside Cursor**, the familiar Cursor shortcuts
work on a Live Preview selection the same way they work in a normal text
editor:

| Shortcut | Product action | Cursor target (best-effort) |
|----------|----------------|-------------------------------|
| **Cmd/Ctrl+L** | Open Cursor **Chat** with the MW selection as context | `aichat.newchataction` (fallback `composer.newAgentChat`) |
| **Cmd/Ctrl+K** | Open Cursor **Edit** (inline) on that selection; user accepts/rejects in Cursor’s UI | `aipopup.action.modal.generate` |

Apply is **Cursor’s**, not ours. After Cursor writes the `TextDocument`, MW’s
custom editor already follows the document model (no custom apply-back path in
v1).

## Non-goals (v1)

- **Apply-back**: no MW-owned diff UI, no re-implementing Cursor Accept/Reject.
- **PDF / Agent PDF Viewer**: Markdown Workbench panels only.
- **Whole-file without selection**: empty selection → no-op (informational
  toast); do not invent a full-file Edit/Chat payload.
- Changing **`agentBridge`** (Copy Link for Agent / LLM Wiki `@path#a-b`):
  remains the clipboard/chat handoff for multi-agent environments. `cursorBridge`
  is Cursor-native Chat/Edit only.
- Prefilling Cursor Chat with arbitrary prompt text (Cursor still has no
  reliable prefill API for Agent Chat; selection context is the contract).

## Why a separate plugin

`agentBridge` deliberately **does not guess** between Cursor / VS Code Chat /
Claude Code / Codex, and formats an LLM Wiki link + blockquote. Cursor users
want **Cmd+L / Cmd+K** muscle memory on the custom editor. That is a different
product surface: host-gated shortcuts + native Cursor commands, not a copy
payload. Keeping plugins separate avoids conflating enablement, settings, and
tests.

## Cursor-host detection (locked method)

Reuse the same predicate already used by document warm and reclaim:

```ts
function isCursorHost(appName: string): boolean {
  return /cursor/i.test(appName);
}
// Call site: vscode.env.appName
```

**Activation behaviour**

1. On host start, evaluate `isCursorHost(vscode.env.appName)`.
2. Set VS Code context key `markdownWorkbench.isCursorHost` to that boolean
   (clear on dispose).
3. Register command handlers always but guard when false (unit tests exercise
   both paths without a second package.json).
4. Contributed keybindings / palette entries include
   `markdownWorkbench.isCursorHost` in their `when` clause so they are
   **inactive on plain VS Code** (no Cmd+K steal there).

Do **not** use `uriScheme === "cursor"` alone: existing handoff tests show
Cursor can still report `uriScheme: "vscode"` in some setups; `appName` is the
established signal in this repo.

Optional hardening (non-blocking): if Cursor AI commands are missing at
runtime, toast and stop (same `tryCommand` style as `agentBridge/chat.ts`).

## Selection contract

1. Resolve the **active** MW editor panel (`editors.active()` / public
   `getActiveEditor()`).
2. Call **`api.getSelection(editorId)`** (public façade) **or** the same
   underlying `selections.capture(editorId)` the façade wraps — same flush +
   version-checked snapshot (`from`, `to`, `startLine`, `endLine`, `text`,
   `version`, `isDirty`, `sourceSha256`).
3. If `undefined` (empty selection): show a short notice
   (“Select text in the note first”) and return. No whole-file fallback.
4. Dirty notes: **allowed** for v1 Chat/Edit (Cursor Edit applies to the live
   `TextDocument`). Do not force Save like Copy Link for Agent does — that
   requirement is about stable disk line references, which this plugin does
   not emit.

## Native apply strategy (Cmd+K) — with B1 / B2

Custom webview editors do not give Cursor `editorFocus` / a VS Code
`TextEditor` selection. To get **native** Edit + Accept:

1. Capture MW selection (above).
2. Ensure the note’s `TextDocument` is materialized (existing
   `warmMarkdownDocument` / warm policy; already Cursor-aware).
3. **Handoff lease (B1):** acquire an explicit handoff lease for the note URI
   **before** opening the native text editor. The lease suppresses reclaim for
   the **entire** native Edit session (not a fixed 10s window). Queued /
   in-flight reclaim must recheck the lease immediately before
   `vscode.openWith` and abort if held. Do **not** treat
   `executeCommand()` resolution as Edit completion. If Cursor provides no
   usable completion signal, leave the native text editor open until the user
   returns to Markdown Workbench (lease releases when the note’s tab leaves
   `text` — e.g. closes, becomes workbench, or becomes Cursor Markdown —
   so a later reclaim can restore MW).
4. **Version-safe mirror (B2):** after async warm/open, recheck
   `TextDocument.version` and identity against the capture. Derive the native
   range with `document.positionAt(selection.from/to)` only on that current
   document. Fail closed if the document changed or the sliced text no longer
   matches; never silently use stale offsets. Verify the expected native
   editor and selection are active before invoking Cursor’s command.
5. Execute `aipopup.action.modal.generate`.
6. Accept/Reject stays 100% in Cursor’s UI; MW then shows the updated document
   through the normal `TextDocument` sync path.

## Chat strategy (Cmd+L)

1. Capture MW selection.
2. Prefer the same TextDocument selection mirror as Edit (so Cursor attaches a
   **code reference**, not only clipboard text), including the handoff lease
   and version checks, then run:
   - primary: `aichat.newchataction` (Q3)
   - fallback if missing: `composer.newAgentChat` (already used by
     `agentBridge`; **clipboard copy of selection text** as last resort,
     without inventing `@path#` agentBridge formatting). If the fallback opens
     without attaching context, copy the selection and tell the user to paste;
     do not report successful context attachment.
3. Do **not** call `agentBridge` APIs or share its payload helpers.

## Command IDs (MW)

| Shortcut | Command id | Title |
|----------|------------|-------|
| Cmd/Ctrl+L | `markdownWorkbench.cursorBridge.chat` | Cursor Chat with Selection |
| Cmd/Ctrl+K | `markdownWorkbench.cursorBridge.edit` | Cursor Edit Selection |

Palette: visible only when `markdownWorkbench.isCursorHost` (and plugin
enabled). Keys contributed from the plugin manifest via
`scripts/generate-contributions.ts`.

## Keybinding conflict: Insert Link (Cmd+K) — B3

Today `formatting` binds **Insert Link** to `ctrl+k` / `cmd+k` whenever the MW
editor is active. On Cursor that collides with Edit.

**Resolution (B3)**

- `cursorBridge.edit` when: MW editor active ∧ plugin on ∧
  `markdownWorkbench.isCursorHost` ∧ `markdownWorkbench.hasSelection`.
- `insertLink` keybinding gains an extra when fragment:
  `!(markdownWorkbench.isCursorHost && markdownWorkbench.hasSelection && markdownWorkbench.plugin.cursorBridge)`
  so on Cursor with a selection **and** cursorBridge enabled, Edit wins; with a
  caret only, Insert Link remains; when cursorBridge is disabled, Insert Link
  is restored even with a selection; on plain VS Code, Insert Link unchanged.

The contribution generator supports per-command `when` fragments (merged with
the plugin enablement clause). Bridge shortcuts stay scoped to the focused MW
editor (`whenActive` + plugin context) so they do not intercept Cursor Chat
input shortcuts.

## Plugin shape

```
src/plugins/cursorBridge/
  manifest.ts      # id, commands, keys, capabilities
  host.ts          # register commands; set isCursorHost context
  cursor.ts        # pure: isCursorHost, CURSOR_COMMANDS, openChat/openEdit
  selection.ts     # resolve active panel + getSelection / capture
  handoff.ts       # TextDocument show + Range mirror + reclaim lease
  README.md        # AGENTS.md plugin README template
```

- **Kind**: feature; **surfaces**: `["host"]` only (no webview half).
- **Catalog**: editor feature, after `agentBridge` in `FEATURE_ORDER`.
- **Inject**: `editors`, `selections`, `workbench` (same trio as agentBridge
  host; do not inject public API object into itself — use services).
- **Capabilities**: `commands`, `keybindings`, `agentHandoff`.
- **Default enabled**: `true` (harmless on VS Code because when-clause gates).
- **Leave** `agentBridge` files untouched.

## Bootstrap / registration

- Export `cursorBridgeHost` from `src/plugins/host.ts`.
- `root.plugin(cursorBridgeHost)` in `src/host/bootstrap.ts`.
- Add to `catalog.ts` + `plugin-order.ts` (after `agentBridge` in
  `FEATURE_ORDER`).
- Run `pnpm contributions` so `package.json` gains commands/keys/settings.

## Settings

- Only the generated `markdownWorkbench.plugins.cursorBridge.enabled`
  (resource-scoped), default `true`.
- No new target enum (unlike `copyLinkForAgent.target`).

## Tests

| Case | Expect |
|------|--------|
| `isCursorHost("Cursor")` | true |
| `isCursorHost("Visual Studio Code")` | false |
| Chat route with `aichat.newchataction` present | executes that command after handoff |
| Chat fallback to `composer.newAgentChat` | used when primary missing |
| Edit route | executes `aipopup.action.modal.generate` |
| Empty selection | false / no Cursor command |
| Non-Cursor environment | commands no-op; no Cursor execute |
| Handoff lease | suppresses reclaim for whole session; in-flight reopen aborts |
| Version validation | fail closed on change; CRLF / surrogates / dirty / concurrent |

No new browser/native suite in v1 unless the owner later approves (AGENTS.md
policy). Manual checks: Cmd+L / Cmd+K on a fixture note in Cursor only.

## Success criteria

1. In Cursor, select text in MW → Cmd+L opens Chat with that selection as
   context (code reference preferred).
2. Select text → Cmd+K opens Cursor Edit; Accept applies via Cursor; note
   content updates in MW without a custom apply-back.
3. In plain VS Code, Cmd+L / Cmd+K from this plugin do nothing; Insert Link
   Cmd+K unchanged when not (Cursor ∧ selection ∧ cursorBridge enabled).
4. `agentBridge` behaviour and tests unchanged.
5. Unit tests cover detection + routing + B1/B2; `pnpm check` green after
   implement.

## Q answers (locked from Pro)

1. **Edit handoff:** yes — `showTextDocument` mirror is the right v1 approach.
2. **Reclaim:** yes — mandatory full-edit reclaim suppress via handoff lease.
3. **Chat primary:** prefer `aichat.newchataction`.
4. **Insert Link:** Cmd+K = Edit only when enabled + selection (+ isCursorHost).
5. **Dirty docs:** live unsaved `TextDocument`; no autosave.

## References (repo)

- Cursor detection precedent: `src/host/document-warm-policy.ts`,
  `src/host/reclaim-policy.ts`
- Selection API: `API.md` (`getSelection`), `src/host/api/editors.ts`
- Agent chat command constants: `src/plugins/agentBridge/chat.ts`
  (`composer.newAgentChat`)
- Reclaim / warm: `src/host/reclaim.ts`, `src/host/document-warm.ts`
- Contribution generator: `scripts/generate-contributions.ts`
- Cursor shortcut docs: https://cursor.com/docs/reference/keyboard-shortcuts  
  Forum command ids: `aichat.newchataction`, `aipopup.action.modal.generate`
