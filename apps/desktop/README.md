# Lumière desktop app

A light Markdown (and later PDF) reader and editor in a window of its own,
in the spirit of Typora, laid out as VS Code: the vault's files on the left,
the note's outline on the right, notes in tabs. The menu and keys are VS
Code's: Settings… (⌘,), Open Folder… (⌘O), Close Tab (⌘W; the window when
it is the last tab), Close Window (⇧⌘W), Toggle Sidebar (⌘B), Toggle Outline
(⌥⌘B), View > Color Theme, and in Window: Show Next Tab (⇧⌘]), Show
Previous Tab (⇧⌘[) and Switch to Last Tab (⌃⇥). It is the same editor as the VS Code
extension.

## How it is put together

```
┌ Lumière.app (Tauri, src-tauri/) ─────────────────────────────┐
│  native window, menu, folder picker, files from Finder       │
│        │ starts, reads the ready line, stops via stdin       │
│        ▼                                                     │
│  lumiere-node  <resources>/app/server.js   (packages/app)    │
│     ├─ the window's page (src/shell, React)                  │
│     ├─ its API: vaults, files, open, events                  │
│     └─ host-node: the Markdown plugins, editor pages,        │
│        tree views (Outline…)                                 │
└──────────────────────────────────────────────────────────────┘
```

The Rust side stays thin on purpose. It starts the server, opens a window on
the server's URL, and passes on what only a native app gets: the menu, the
folder picker, and files opened from Finder or a second launch. Everything
else (vaults, files, editing, settings, outline) is the server's, so it
works the same in a browser. If a feature seems to need Rust, put it in the
server first.

The contracts between the pieces:

| Between | Where it is written down |
| --- | --- |
| this app and the server | `packages/app/src/server/contract.ts` (arguments, the ready line, stopping) and `src-tauri/src/server.rs` |
| the window's page and this app | `packages/app/src/shell/tauri.ts` and `src-tauri/capabilities/shell.json` (keep them the same size) |
| the window's page and the server | `packages/app/src/server/api.ts`, `@workshop/host-node/views` |
| the window and each editor page | `@workshop/host-node/embedding` (theme, open, shown) |

## Run it

```bash
pnpm --filter @workshop/desktop dev
```

`scripts/dev.mjs` builds `packages/app`, then runs `tauri dev` with the app
starting `packages/app/dist/app/server.js` under your Node. Set
`LUMIERE_DATA=/tmp/lumiere-dev` to keep settings and the list of recent
vaults out of the real app's data folder. To open a vault at launch, pass
its path to the built binary:
`src-tauri/target/debug/lumiere-desktop ~/notes`.

The window's page also runs without Tauri, in a browser:

```bash
node packages/app/dist/app/server.js --vault /path/to/test-vault
```

Open the `url` from the ready line it prints.

## Build it

```bash
pnpm --filter @workshop/desktop build
```

`scripts/build-sidecar.mjs` builds `packages/app` for production, copies it
to `src-tauri/resources/app/`, and puts an official Node.js runtime (from
nodejs.org, checked against its SHA-256 sums) at
`src-tauri/binaries/lumiere-node-<target>`. A system Node, such as
Homebrew's, links libraries the bundle does not carry, so it is never used.
Then `tauri build --config src-tauri/tauri.bundle.json` bundles both.

## Checks

```bash
pnpm --filter @workshop/desktop check
```

This runs `cargo check` and the Rust unit tests: the ready line, the open
request and launch arguments. The server and window have their own tests in
`packages/app` (`pnpm check` at the root runs them).

## Not done yet

See `docs/HOSTS_PLAN.md` (milestones M4 and M5) for the order. In short:

- PDFs in tabs (Lumière PDF's viewer behind the same server);
- signing, notarisation, the bundle identifier and the real icon (owner
  decisions; `src-tauri/icons/source.png` is a placeholder);
- the browser tests for the window (`packages/app/test/e2e`);
- Backlinks and Tags under the outline: each is one `TreePanel` with a view
  id from `@workshop/host-node/views`.
- 18 of Lumière's 100 settings have no description in their manifests, so
  Settings shows them bare (VS Code does too).
