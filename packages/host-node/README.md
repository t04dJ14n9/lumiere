# Lumière's Node host (`@workshop/host-node`)

Runs Lumière's Markdown plugins in a Node process other than VS Code and
serves their editor pages to a web page that embeds them. It knows no
embedder. Its embedders are:

- `packages/dsh`, a DeepSeek Harness plugin;
- `packages/app`, Lumière's own server, which the desktop app
  (`apps/desktop`) runs.

## How it works

The Markdown plugins reach their editor only through the host services in
`packages/markdown/src/shared/host`. This package implements those services
over Node, then starts the plugins with the same `bootstrap` VS Code uses
(`@workshop/markdown/portable`). `startLumiere()` returns the running host:

- `panels`: the open editor pages;
- `trees`: the plugins' tree views (Outline, Backlinks, Tags, Outgoing
  Links);
- `stop()`.

`createEditorRoutes()` serves everything a page needs, below `/lumiere`, on
any Node web server:

- `/lumiere/editor?path=&root=`: a note's page;
- `/lumiere/pdf?path=&root=`: a PDF's page, Lumière PDF's viewer
  (`/lumiere/pdf/viewer/*`), which fetches the PDF from `/lumiere/pdf/bytes`.
  It runs only when the embedder passes the built viewer (`EditorAssets.pdf`);
- `/lumiere/m/*`: the built editor;
- `/lumiere/page/shim.js`: the page shim;
- `/lumiere/file`: a note's images;
- `/lumiere/socket`: the page's socket;
- `/lumiere/views`: the tree views;
- `/lumiere/settings`: Lumière's settings, for a settings page. A plugin
  declares what it needs from its host (`needs` in its manifest: VS Code's
  window, Git, panels); this host offers Git (`NODE_HOST_OFFERS`), so the
  settings of a plugin that needs the window or panels are left out.

The embedder puts its own authentication in front of them. A page runs in
the embedder's iframe. Its shim stands in for VS Code's webview API: what
VS Code would carry between webview and extension travels over the page's
socket to its panel here.

A right-click in a page shows Lumière's `webview/context` menu as VS Code
does (`context-menu.ts`): the page reports the clicked element's
`data-vscode-context`, the host keeps the context keys the plugins set
(`setContext`) and evaluates each item's when-clause (`when.ts`), the page
draws the items it is sent with Cut, Copy and Paste, and the host runs the
chosen command. `menus.json`, written at build time, lists the items.

Paths are checked as VS Code's host checks them (`paths.ts`): inside the
workspace after `..` is resolved, and still inside through symbolic links.
The workspace may not be the filesystem root.

The host itself is shared with host-web: `@workshop/host-node/core`
(`src/core.ts`) starts the plugins on a `HostPlatform` (`src/host/platform.ts`)
and reaches no Node built-in, which `test/unit/core-layers.test.ts` checks.
`startLumiere` gives it Node's platform (`src/host/node-platform.ts`).

## The contracts it defines

| Module | Between | What |
| --- | --- | --- |
| `src/protocol.ts` | page ↔ host (socket) | `rpc` frames (the editor's own RPC) and `ui` frames (prompts, toasts, focus, the right-click menu) |
| `src/embedding.ts` | embedder ↔ page (`postMessage`) | the theme, "open this file", "you are shown" |
| `src/palette.ts` | embedder → page | an embedder's colour roles as the `--vscode-*` variables |
| `src/views.ts` | embedder ↔ host (HTTP) | tree snapshots, clicks, visibility, events |
| `src/settings.ts` | embedder ↔ host (HTTP) | every setting with its value, group and title; changes, checked as VS Code's commands check them |

The last four are browser-safe entries (`@workshop/host-node/embedding`,
`/palette`, `/views`, `/settings`) for an embedder's page. Its Node half imports the main
entry. The `architecture/boundaries` lint rule allows no other import, and
forbids this package from importing `vscode` or any embedder.

## Files

- `src/host/start.ts`: starts the plugins over the services below.
- `src/host/services.ts`: every host service the plugins inject.
- `src/host/documents.ts`: notes on disk, edited in memory, saved after a pause.
- `src/host/panels.ts`, `src/host/panel.ts`: editor pages as panels, and their sockets.
- `src/host/routes.ts`, `src/host/page.ts`, `src/host/static.ts`: the routes above.
- `src/host/pdf-pages.ts`, `src/host/pdf-routes.ts`: PDF tabs, on Lumière PDF's viewer core (`@workshop/pdf/portable`) and the same page shim and socket as notes.
- `src/host/trees.ts`, `src/host/view-routes.ts`: the plugins' tree views and their routes.
- `src/host/settings-routes.ts`: the settings for a settings page, and changes to them.
- `src/host/context-menu.ts`, `src/host/when.ts`, `src/page/context-menu.ts`: the right-click menu, its when-clauses, and drawing it.
- `src/host/vault.ts`: the vault index's file system: listing and watching.
- `src/host/navigation.ts`: following links, creating notes, revealing in an open page.
- `src/host/settings.ts`: settings from the contributed defaults and a JSON file.
- `src/host/ui-services.ts`: dialogs, the clipboard and the active editor, drawn by the page.
- `src/host/workspace.ts`, `src/host/watch.ts`: workspace files and state, and file watching.
- `src/host/paths.ts`: containment and safe writes.
- `src/host/git.ts`, `src/host/git-blobs.ts`, `src/host/git-program.ts`: Git from the `git` command line (blame, a note at HEAD or in the index, staging, each repository's changes), and which `git` to run.
- `src/host/inert.ts`: diffs, status entries and panels, which have no counterpart yet.
- `src/page/shim.ts`, `src/page/ui.ts`, `src/page/theme.ts`: the page's stand-in for VS Code.
- `scripts/assets.mjs`: what every embedder ships beside its code (the editor, the shim, the settings).

## Limits

- Git is blame, the change gutter and staging, through the `git` on the
  PATH (`git.ts`), for notes inside the workspace. On macOS, Xcode's
  `/usr/bin/git` stand-in is used only when the command-line tools are
  installed, so no install dialog appears. A repository is watched once a
  note in it was asked about; a `git init` is seen on the next question.
- No rendered or native diffs, no status bar entries and no extra panels
  (the vault graph) yet: `inert.ts` answers for them as VS Code does when
  they are unavailable.
- No command palette or keybindings: commands run from clicks, links and the
  editor's own menus.
