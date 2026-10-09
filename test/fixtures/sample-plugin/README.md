# Sample external plugin: Tickets

A tiny VS Code extension that adds a plugin to Markdown Workbench through API
v1. API.md walks through its code. It is for the manual test plan, not for
publishing.

- **Markers:** a `TODO` badge after every `TODO` in an open note. Clicking a
  badge shows which line it is on.
- **Links:** `[Bug](ticket:42)` opens
  `https://github.com/t04dJ14n9/vscode-markdown-workbench/issues/42` (change
  `mwsampleTickets.baseUrl`).
- **Code blocks:** a fenced block with the language `tickets`, one number per
  line, renders as a list of ticket links.
- **Command:** **Sample Tickets: Refresh TODO Badges**.

The plugin is listed by **Markdown Workbench: Show Plugin Status** and turned
off with `"markdownWorkbench.plugins.external": { "mwsample.tickets": false }`.

## Install into an isolated profile

```sh
cd test/fixtures/sample-plugin
npx @vscode/vsce package --allow-missing-repository --skip-license
code --user-data-dir /tmp/mdwb-manual/user-data \
  --extensions-dir /tmp/mdwb-manual/extensions \
  --install-extension tickets-0.0.1.vsix
```

Install Markdown Workbench's own VSIX into the same profile first (see
docs/MANUAL_TEST_PLAN.md). Or run it without packaging:

```sh
code --user-data-dir /tmp/mdwb-manual/user-data \
  --extensions-dir /tmp/mdwb-manual/extensions \
  --extensionDevelopmentPath "$PWD" ../vault
```

## Files

- `package.json`: the extension manifest; it depends on Markdown Workbench.
- `extension.cjs`: activation; gets the API and registers the plugin.
- `plugin.cjs`: the plugin definition, with `vscode` passed in so unit tests
  can run it (`test/unit/api/sample-plugin.test.ts`).
