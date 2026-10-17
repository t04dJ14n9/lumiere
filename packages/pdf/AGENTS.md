# Agent instructions: PDF Workshop

PDF Workshop is one half of the "Workshop: Markdown and PDF" extension: a
PDF viewer built on EmbedPDF that copies selections with exact page-and-box
locations. The repository's [AGENTS.md](../../AGENTS.md) applies; these rules
are specific to the PDF code. Read README.md for the layout.

- `src/shared` must run anywhere: no DOM, VS Code or Node APIs. The package's
  `tsconfig.json` enforces this.
- The webview is untrusted. Every message from it goes through
  `parseViewerMessage`; add a validator when adding a message.
- Track editors per panel (`PdfPanels`), never by file path: the same PDF can
  be open twice.
- Keep the Copy Link for Agent text wording compatible with LLM Wiki's agent
  clipboard, and the handoff format identical to Markdown Workshop's:
  `docs/agent-handoff-format.md` and `test/fixtures/agent-handoff-format.json`
  are byte-identical in both packages (a test pins their hashes). The
  structured selection envelope is a separate contract
  (`docs/bridge-envelope.md`, command `vscodeEmbedPdf.bridge.envelope`) and
  does not change that clipboard text.
- Features are plugins (`src/extension/plugins/<id>/`, listed in
  `catalog.ts`). Register every VS Code resource through the plugin's scope
  so it is released when the plugin stops; `test/unit/plugin-leaks.test.ts`
  fails otherwise. Names: plugin `agentBridge`, service `AgentHandoff`,
  command `copyLinkForAgent`.
- Prefer EmbedPDF's components and events over re-implementing them.

Run the checks from the repository root (`pnpm check`, then
`pnpm test:browser` and `pnpm test:vscode`).
