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
- Keep the Copy for Agent wording compatible with LLM Wiki's agent clipboard.
- Prefer EmbedPDF's components and events over re-implementing them.

## Checks

Run before committing, in this order:

```sh
pnpm check
pnpm test:browser
pnpm test:vscode   # opens a VS Code window
```

Do not publish to the Marketplace or push without the owner's approval.
