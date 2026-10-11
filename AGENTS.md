# Agent instructions

A VS Code extension: a PDF viewer built on EmbedPDF that copies selections
with exact page-and-box locations. Read README.md for the layout.

## Rules

- `src/shared` must run anywhere: no DOM, VS Code or Node APIs. The root
  `tsconfig.json` enforces this.
- The webview is untrusted. Every message from it goes through
  `parseViewerMessage`; add a validator when adding a message.
- Track editors per panel (`PdfPanels`), never by file path: the same PDF can
  be open twice.
- Keep the Copy Link for Agent text wording compatible with LLM Wiki's agent clipboard,
  and the handoff format identical to Markdown Workbench's:
  `docs/agent-handoff-format.md` and `test/fixtures/agent-handoff-format.json`
  are byte-identical in both repositories (a test pins their hashes).
- Features are plugins (`src/extension/plugins/<id>/`, listed in
  `catalog.ts`). Register every VS Code resource through the plugin's scope
  so it is released when the plugin stops; `test/unit/plugin-leaks.test.ts`
  fails otherwise. Names: plugin `agentBridge`, service `AgentHandoff`,
  command `copyLinkForAgent`.
- Prefer EmbedPDF's components and events over re-implementing them.

## Checks

Run before committing, in this order:

```sh
pnpm check
pnpm test:browser
pnpm test:vscode   # opens a VS Code window
```

`pnpm check:full` runs all three in that order. The real-VS Code specs
(`test/vscode`, `pnpm test:vscode`) do **not** run in GitHub Actions: they were
flaky under load. They are a required local pre-push check, so run the full
`pnpm check:full` before every push, on a headless Linux box as
`xvfb-run -a pnpm check:full`.

Do not publish to the Marketplace or push without the owner's approval.
