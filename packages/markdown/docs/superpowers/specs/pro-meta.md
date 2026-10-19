# Pro batch meta — cursorBridge v1

- Created: 2026-10-15 15:19 +08 (Asia/Singapore)
- Design path (repo): docs/superpowers/specs/2026-10-15-cursor-bridge-design.md
- Package: /workspace/plans/pro-batch-cursor-bridge-2026-10-15/
- Repo HEAD when drafted: ca61e3d (branch had unrelated table WIP; design-only)
- origin/main tip noted: 0d195cf
- Implementation / PR: **blocked** until ChatGPT Pro APPROVE
- Cursor detection method proposed: /cursor/i.test(vscode.env.appName) → context markdownWorkbench.isCursorHost
- Proposed MW command IDs: markdownWorkbench.cursorBridge.chat, markdownWorkbench.cursorBridge.edit
- Proposed Cursor targets: aichat.newchataction (fallback composer.newAgentChat); aipopup.action.modal.generate
