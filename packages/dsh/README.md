# Lumière in DeepSeek Harness (`@workshop/dsh`)

Opens the Markdown notes of a [DeepSeek Harness](https://www.deepseek.com/en/harness/)
(DSH) workspace in Lumière's editor, in DSH's preview sidebar, instead of
DSH's read-only preview: the same Obsidian-style Live Preview, wikilinks,
embeds, properties, math, Mermaid and callouts as in VS Code and Cursor.
Notes save as you type. DSH's own preview stays in the viewer menu above a
note.

## How it works

DSH, like Lumière, is built on Cordis with "everything is a plugin", and a
DSH bundle has a host half (Node) and a browser half. Lumière's Markdown
plugins already reach their editor only through the host services in
`packages/markdown/src/shared/host`, so the host half here implements those
services over Node and DSH, and starts the plugins with the same `bootstrap`
VS Code uses (`@workshop/markdown/portable`). Lumière's plugin tree runs on
its own Cordis; DSH's context objects never enter it.

The browser half registers Lumière as the Markdown renderer of DSH's
document previews (`ctx.documentPreviews`, at the `extension` band, which
outranks DSH's own). Its body is an iframe of the editor page, the same
webview bundle VS Code shows, served by the host half from DSH's web server
behind DSH's browser authentication. A shim in the page stands in for VS
Code's webview API: `acquireVsCodeApi().postMessage` and the page's
`message` events travel over a WebSocket to the panel on the host, and DSH's
theme tokens become the `--vscode-*` variables the editor's styles read.

Following a link to a note that is not open asks DSH to open it in a new
tab (`ctx.sidebarRight.openResource`); the host reveals the heading or block
once the new page connects.

## Files

The Node host itself (documents, panels, settings, navigation, the page shim
and the routes) is `@workshop/host-node`, shared with Lumière's desktop app.
What is DSH's:

- `src/host/index.ts`: the DSH plugin: starts Lumière and mounts its routes.
- `src/host/routes.ts`: host-node's routes on DSH's web server, behind DSH's authentication.
- `src/host/dsh.ts`: the parts of DSH's plugin context used here.
- `src/client/index.ts`: the browser half: the document preview and following links.
- `src/client/address.ts`: DSH's file addresses.
- `src/client/theme.ts`: DSH's theme tokens as host-node's palette.
- `scripts/build.mjs`: builds the installable bundle into `dist/bundle`.

## Services, routes and settings

The host half injects DSH's `webServer` and `connection`; the browser half
`documentPreviews`, `slots` and `sidebarRight`. Routes, all behind DSH's
authentication: `/lumiere/editor` (a note's page), `/lumiere/m/*` (the
editor), `/lumiere/page/shim.js` (the shim), `/lumiere/file` (a note's images, inside
its workspace only — `..` and a symbolic link that leaves the workspace are
refused) and the `/lumiere/socket` upgrade. Settings use the
`lumiere.markdown.*` keys and defaults of the VS Code extension and are kept
in `$DSH_HOME/lumiere/settings.json` (`~/.dsh` by default), beside the vault
snapshots and editor state.

## Build and install

```sh
pnpm --filter @workshop/dsh build          # dist/bundle
dsh plugin --profile web add link:$PWD/packages/dsh/dist/bundle
dsh web
```

Needs DeepSeek Harness 0.2.1 or later, whose document previews accept
plugins. Restart DSH after rebuilding.

## Limits and differences from VS Code

- Markdown only: PDFs still open in DSH's own viewer.
- Git blame and the change gutter work for notes in a repository, through
  the `git` on DSH's PATH; the rendered diff does not.
- No graph panel and no status bar: DSH has no counterpart yet.
- Outline, Backlinks and Tags are served by the host (`/lumiere/views`) but
  not yet shown in DSH: each would be a DSH sidebar tab drawing a tree from
  `@workshop/host-node/views`, as the desktop app's sidebar does.
- Commands have no palette or keybindings in DSH yet; what Lumière does
  through clicks, links, the editor and its context menus works.
- Copy Link for Agent copies to the clipboard: paste into DSH's chat.
- Renaming a note from its inline title is not available.
- The editor page is same-origin with DSH, so its strict content security
  policy (scripts by nonce only) is what keeps a note's scripts from running.
  The page can still read DSH's DOM, which is how it follows the theme.
- A workspace that is the filesystem root is refused. The root otherwise is
  the directory DSH's preview names for that note; the host re-checks every
  path against it.
- Copying a file into the vault from outside the workspace is refused.
  DSH has no file picker for that yet.
