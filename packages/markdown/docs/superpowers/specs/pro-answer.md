# cursorBridge design review — ChatGPT (Plus)

- Chat URL: https://chatgpt.com/c/6ad0800e-7ee4-83ea-91f1-058d2f0c4fda
- Account: ChatGPT **Plus** (sidebar: Toad Jiang / Plus). No Pro reasoning slider on this account.
- Model (UI, confirmed before send): **GPT-6** checked. Other option GPT-5.6 Sol unchecked.
- Reasoning: **High**, slider 3 of 3 (`aria-valuenow` 2 / `aria-valuemax` 2). Highest available on Plus. Not Pro.
- Model self-report: GPT-6, High reasoning (the maximum setting specified for this Plus chat).
- Thinking: **yes**. "Worked for 5m 37s". Not an instant reply.
- Not implemented. Not merged.

## Verdict: REQUEST CHANGES

Model: GPT-6, High reasoning (the maximum setting specified for this Plus chat).

Assessment: The product direction is sound, and the architecture is feasible without a custom apply-back mechanism or a new Cursor API. However, the proposed implementation has 3 blocking correctness issues involving reclaim timing, selection validity, and keybinding behavior.

The existing CustomTextEditorProvider and shared TextDocument model are suitable for native Cursor editing. The blockers are in the handoff lifecycle, not the owner-approved product decisions.

## 1. Blocking issues

### B1 — P1: Reclaim can interrupt an active Cursor Edit session

Location: `01-cursor-bridge-design.md:98–114`; `src/host/reclaim.ts`; `src/host/reclaim-policy.ts`.

The proposed short bypass window does not establish a safe lifecycle for native Cursor Edit.

Repository inspection confirms:

- `textBypass` uses a 10-second expiration.
- `registerReclaim()` watches tab changes and launches `reopen()` asynchronously.
- `reopen()` calls `vscode.openWith` to restore Markdown Workbench and may close a clean native text tab.
- The reclaim operation has no explicit knowledge of Cursor's inline Edit state.

Failure scenario:

1. Select text in Markdown Workbench and press Cmd+K.
2. The native text editor opens and Cursor displays its Edit bar.
3. The user spends longer than 10 seconds composing or reviewing an edit.
4. A subsequent relevant tab change triggers reclaim after the bypass expires.
5. Markdown Workbench replaces the editor while Cursor's edit is still pending.

This can destroy the user's active editing workflow or make pending suggestions impossible to accept.

There is also an in-flight race: a reclaim already awaiting `warmMarkdownDocument()` may continue after a bypass is acquired because it does not recheck the bypass immediately before `vscode.openWith`.

Required fix:

- Use an explicit handoff lifecycle rather than a fixed-duration bypass.
- For v1, the safest choice is:
  - Acquire a handoff lease before opening the native text editor.
  - Suppress reclaim throughout the native Edit session.
  - Do not treat resolution of `executeCommand()` as proof that editing has finished.
  - Do not automatically reclaim until completion can be established reliably.
  - If Cursor provides no usable completion signal, leave the native text editor open until the user explicitly returns to Markdown Workbench.
  - Prevent previously queued reclaim operations from bypassing the new lease.

This preserves native Accept/Reject without adding any custom apply-back code.

### B2 — P2: Selection offsets and document-version validation are insufficiently specified

Location: `01-cursor-bridge-design.md:78–90, 98–103`; `src/plugins/editor/selection.ts`; `src/shared/document/coordinates.ts`.

Repository inspection confirms that `SourceSelection.from` and `.to` are source-text offsets, not VS Code line/column pairs or necessarily CodeMirror's normalized offsets.

The existing `SourceCoordinates` converts LF-normalized editor offsets to source offsets, accounting for CRLF line endings.

The design must explicitly convert these offsets using the actual native document:

```ts
const range = new vscode.Range(
  document.positionAt(selection.from),
  document.positionAt(selection.to),
);
```

More importantly, selection capture, document warming, and native editor activation are asynchronous.

Failure scenario: An external edit changes the document after selection capture but before Cursor Edit starts. The old offsets can now select different text. Cursor's native Apply would then operate on the wrong passage.

Required fix:

- Capture via `selections.capture()` or the equivalent public API.
- Validate the snapshot against the original document before handoff.
- Recheck native `TextDocument.version` and identity after asynchronous warming/opening.
- Derive the native range using `document.positionAt()` only after validating the current document.
- Verify that the expected native editor and selection are active before invoking Cursor's command.
- Fail closed if the document changed; never silently use stale offsets.
- Include tests for CRLF, Unicode surrogate pairs, dirty buffers, and concurrent edits.

### B3 — P2: Cmd+K becomes unavailable when cursorBridge is disabled

Location: `01-cursor-bridge-design.md:139–155`; `src/plugins/formatting/manifest.ts`; `scripts/generate-contributions.ts`.

The proposed Insert Link condition is:

```
!(markdownWorkbench.isCursorHost && markdownWorkbench.hasSelection)
```

But the Cursor Edit binding separately requires `markdownWorkbench.plugin.cursorBridge`.

Failure scenario:

1. Run Markdown Workbench inside Cursor.
2. Disable the cursorBridge plugin.
3. Select text.
4. Press Cmd+K.
5. Insert Link is suppressed, and Cursor Edit is disabled. The existing Markdown Workbench shortcut is therefore lost.

Required fix:

Include effective plugin enablement in the Insert Link exclusion:

```
!(markdownWorkbench.isCursorHost &&
  markdownWorkbench.hasSelection &&
  markdownWorkbench.plugin.cursorBridge)
```

Additionally:

- Extend the contribution generator to support per-command `when` fragments instead of adding competing keybinding overrides.
- Verify that `markdownWorkbench.hasSelection` is current when keybindings resolve, especially immediately after a selection changes.
- Restrict the bridge shortcuts to the focused MW editor, so they cannot intercept shortcuts intended for Cursor's Chat input or other UI.

A disabled cursorBridge must restore the prior Insert Link behavior, including when text is selected.

## 2. Non-blocking follow-ups

- Cursor command discovery: The proposed command IDs have precedent, but they are internal Cursor commands, not a stable public extension integration contract. Check availability at runtime and distinguish command execution from successful context attachment.
- Chat fallback: If `composer.newAgentChat` opens without attaching the selection, copy the selected text and explicitly tell the user to paste it. Do not report successful context attachment.
- Plugin placement: Editor feature, host-only, default enabled, after agentBridge in FEATURE_ORDER is appropriate. No reason to modify agentBridge.
- Testing: Add a concise manual matrix covering Cursor versus VS Code, plugin enabled/disabled, dirty/clean files, accepted/rejected edits, selection changes during handoff, and reclaim after an extended editing session.

## 3. Answers to the five Questions for ChatGPT Pro

### Q1 — Edit handoff: Is showTextDocument the right approach?

Yes. Temporarily opening the same document in a real VS Code TextEditor, mirroring its selection, then invoking native Cursor Edit is the appropriate v1 mechanism.

VS Code's CustomTextEditorProvider shares the underlying TextDocument with native text editors, making this architecture viable.

Do not wait for a hypothetical custom-editor integration API. Implement the version-safe handoff and lifecycle controls described above.

### Q2 — Reclaim race: Suppress until the Edit bar closes?

Yes, mandatory. Suppress reclaim for the entire native edit interaction, not for a fixed 10-second window and not merely until `executeCommand()` resolves.

If the Cursor Edit bar's completion cannot be detected reliably, retain the native editor until the user explicitly returns to Markdown Workbench. This is safer than guessing when native editing has completed.

### Q3 — Chat primary command: Which command should v1 prefer?

Prefer `aichat.newchataction`.

| Command | Recommendation |
| --- | --- |
| `aichat.newchataction` | Primary for Cmd+L |
| `composer.newAgentChat` | Fallback, with context verification |
| `aichat.insertselectionintochat` | Not primary; historically associated with adding a selection to Chat |

Cursor's current shortcut documentation identifies Cmd+L as adding a selection to a new chat, and Cursor support has confirmed `aichat.newchataction` as the corresponding command in 2026. Historical versions have changed related chat behavior, so test against the installed Cursor version.

### Q4 — Insert Link: Is the proposed Cmd+K gating acceptable?

Yes, product-wise. With an active selection in Cursor and cursorBridge enabled, Cmd+K should mean Cursor Edit. Without a selection, it should retain Insert Link. Plain VS Code should remain unchanged.

The condition must also account for plugin enablement and reliable selection/focus state, as described in B3.

### Q5 — Dirty documents: Allow without forced save?

Yes. Chat and Edit should operate on the live unsaved TextDocument. Saving is unnecessary for these operations because the bridge is not generating stable disk-based line references.

Require a successful flush and document-version validation. Preserve dirty state, native undo history, and the existing save workflow. Do not automatically save or reload the document during handoff.

## 4. Go/no-go for implementation this week

NO-GO on the current draft; GO this week once B1–B3 are resolved in the design, with native Cursor Edit/Apply and selection handoff verified end-to-end.
