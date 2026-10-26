# Handoff: host-web (H1) and the web app

Session `web-host`, 2026-10-25. Branch `claude/lumiere-web`, worktree
`/Users/t04dj14n9/Code/vscode-workshop/lumiere-web`, cut from
`claude/lumiere-on-dsh` at `d7e9a1ab`. Nothing is pushed and there is no PR.
The task is in docs/IPAD_PLAN.md §2 and §6 (H1), then `apps/web`.

## Done: Phase 1, the plugins' host half without Node (7 commits)

`@workshop/markdown/portable` now bundles for a browser with no Node
built-in. Each commit keeps behaviour as it was and has tests:

| Commit | What |
| --- | --- |
| `43d760af` | Script nonces come from Web Crypto (`src/shared/nonce.ts`), not `node:crypto` (editor and graph pages). |
| `06b8deb3` | `btoa`/`TextEncoder` in place of `Buffer` (onlineVideos cover data URLs, IDE context packets). A test pins the base64 to Buffer's output. |
| `014f85c9` | **Contract:** `GitAccess.sourceOf(uri)` parses `git:` URIs. It moved from `plugins/resources/diff-resources.ts` to `src/host/git-source.ts` (VS Code; still Node's `pathToFileURL`). host-node's `noGit` returns `{ source: uri }`. |
| `12ee7aa4` | **Contract:** `AgentHost.ideContextTemp?: { fs, dir, fileUri }`. The Node temp FS moved to `src/host/ide-context-temp.ts` (VS Code only). Without it, Codex falls back to the clipboard, as it already did. `src/host/ide-context-file-uri.ts` was moved there with `git mv`. |
| `b8b56918` | **Contract:** `HostWorkspace.realContains?(root, uri)`. VS Code and host-node use `realContains` from the new `@workshop/markdown/node` entry, so the behaviour is exactly as before. Without it, links are refused one path component at a time, as virtual workspaces already are. `contains()` no longer uses `node:path`, and a test pins it to `path.posix.relative`. |
| `dd4fe989` | **Contract:** `Extensions.workerPath(name)` is now `Extensions.workers: WorkerLauncher` (`src/shared/workers.ts`, exported from portable). `createVaultParser(launcher)`. `nodeWorkerLauncher(dir)` is in `@workshop/markdown/node`. The worker scripts are split into their logic (`workers/vault-worker.ts` `serveVault`, `workers/search-worker.ts` `serveSearch`) plus entries: Node `vault.ts`/`search.ts` and browser `vault.web.ts`/`search.web.ts` (`web-port.ts`; typechecked by `src/workers/tsconfig.web.json`). The markdown build still emits only the `.cjs` workers, so the VSIX is unchanged. The browser workers are to be built by host-web or apps/web. |
| `e22ea59f` | Guard: `test/unit/layers.test.ts` bundles portable for the browser and fails if it imports any Node built-in. |

How I know it works: `pnpm check` passed on `e22ea59f` (log of that run, in
my scratchpad, not kept). `pnpm build` passes. `pnpm test:browser` and
`pnpm test:vscode` have **not** run. Run both before pushing, since the
VS Code adapter changed (workers, Git, IDE context, containment).

Known flake, not caused by this work: host-node `watch.test.ts`, "a file in
folders that do not exist yet is heard when it appears", timed out once
under a full parallel run and passed 3 out of 3 on its own.

## In progress

Nothing is uncommitted. Phase 2 was designed but not started.

## Next, in order

1. **`packages/host-core`** (new, browser-safe). Move host-node's shared
   modules there with `git mv`, so the desktop sessions' edits follow the
   rename when they merge:
   - the logic: `context-menu`, `when`, `trees`, `panel`, `panels`,
     `ui-services`, `inert`, `documents`, `navigation`, `settings`,
     `workspace`, `services`, `start`, and the vault system;
   - the contracts: `protocol`, `embedding`, `palette`, `views`, `settings`;
   - the page shim: `src/page/*`.

   host-node keeps:
   - its public entries (`.`, `./embedding`, `./palette`, `./views`,
     `./settings`), as thin re-exports in a new folder, so the old paths
     are renamed rather than rewritten;
   - its HTTP routes, `static.ts`, `paths.ts`, `watch.ts` and
     `scripts/assets.mjs`, with the shim entry pointed at host-core;
   - `startLumiere(StartOptions)` with its signature unchanged.

   It builds a Node `HostPlatform` and calls the core. Split
   `settings-routes.ts` into a core settings service (list and change,
   with `checkWrite`) and the HTTP wrapper. Move `injectShim` into the
   core; `pageQuery` stays in host-node, because Node's paths are
   Windows-aware.
2. **The page transport.** The shim keeps the WebSocket by default. When
   the page has `<meta name="lumiere-transport" content="channel">`, it
   posts `{lumiere:"connect", panel}` to its parent and takes the
   `MessagePort` from `{lumiere:"port", panel}`. Add both messages to
   `embedding.ts`. The transport's listener must be registered before
   `listenToEmbedder`, which stops embedding messages. The frames stay
   `protocol.ts`'s, unchanged.
3. **`packages/host-web`**:
   - a `VaultFileSystem` service, with a memory implementation and one
     over `FileSystemDirectoryHandle`, which covers both OPFS and the
     File System Access API;
   - a mount table from vault root path to file system, giving the
     core's `HostFiles` over `file:` URIs;
   - a JSON data store;
   - `@noble/hashes` digests (the owner approved this dependency for the
     web-extension work);
   - a Web Worker launcher;
   - `pages.open(note, root) → {id, html}` and the MessagePort
     `PageSocket`;
   - `resources.read(panel, uri)`, which checks containment;
   - `workspace.vaultCode`, taken from the embedder.
4. **Shared contract tests.** Suites in host-core take a platform fixture
   and run against host-node (a temp folder) and host-web (the memory
   file system).
5. **`WindowBackend`** in `packages/app/src/shell/backend.ts`. Today's
   fetch code becomes `httpBackend()`, given through React context.
   `EditorFrame` uses `backend.editors.open()`.
   `packages/app/src/local/` is the in-process backend over host-web:
   vaults, files, UI state, trust (`vault-trust.ts` made browser-safe
   over a store), settings, views and events. Export the window as
   `@workshop/app/shell`.
6. Playwright tests: Lumière in a plain browser from an in-memory vault,
   in Chromium and WebKit. WebKit build 2370 is already installed for
   Playwright 1.64.1. Then open the H1 PR against `claude/lumiere-on-dsh`
   and tell session `ipad-app` that the API is stable.
7. **`apps/web`**:
   - a static esbuild build of the window, the local backend and
     host-web, with the browser workers built from `*.web.ts`;
   - File System Access where available, otherwise OPFS;
   - the demo vault, copied into OPFS on first run;
   - a manifest and a service worker that caches for offline use and
     answers `lumiere/file?panel=&uri=` by asking host-web in the window;
   - a README;
   - a second PR.
8. Docs:
   - IPAD_PLAN H1 status;
   - HOSTS_PLAN §3 (host-core) and §4: add `WindowBackend`, the page
     transport, `VaultFileSystem`, and the three contracts above
     (`sourceOf`, `ideContextTemp`, `realContains`, `workers`);
   - the READMEs;
   - manual browser checks for Grok Bot.

## Decisions and why (the iPad work depends on these)

- **Vaults are `file:` URIs over absolute POSIX paths, even in a
  browser.** A browser vault is `/<area>/<name>` (OPFS or a picked
  folder). On the iPad it is the real folder path. Plugin code and the
  window's path-based code then work unchanged, and host-web maps a vault
  root to its `VaultFileSystem`.
- **One low-level file abstraction (`HostFiles`) in the core**, rather
  than one per host service, so containment, listing, link resolution and
  note creation are written once. Containment is per platform:
  - lexical `isInside`, which on Node handles Windows paths;
  - `assertContained`, which on Node resolves real paths, and in the
    browser is lexical (there are no symbolic links there).

  Writes keep host-node's modes: existing-file no-follow (saves),
  create-new exclusive (new notes), atomic replace (data store).
- **The editor page in host-web is a blob-URL document**, not `srcdoc`:
  - `location.origin` stays the window's origin, which the editor's
    transport checks;
  - no service worker is needed for the page itself, because WKWebView
    on `capacitor://` has none.

  What this requires:
  - asset URLs must be absolute (`assetBase`);
  - the window's CSP must allow what the editor page needs, because blob
    documents inherit the creator's policy; the page's own nonce CSP
    still applies;
  - the shim's state key must come from a meta tag, since a blob URL has
    no `location.search`.
- **Images and PDFs inside notes**:
  - host-web's `panel.resource()` URL is configurable, defaulting to
    `lumiere/file?panel=&uri=`;
  - in the web app, a service worker answers it by asking host-web;
  - on the iPad, native code or the iPad session's own route answers it.
- **`WindowBackend`** is grouped as `vaults`, `trust`, `events`, `ui`,
  `settings`, `views`, `editors`, and an optional `pickFolder`. Its
  `editors.open()` returns `{url, connect?(): MessagePort, dispose()}`.
  `EditorFrame` answers the page's connect message by posting the port.
  A MessagePort has no close event, so the tab's unmount calls
  `dispose()`.
- **Browser workers are built by whoever ships them**, so the VSIX and
  the desktop app do not grow.
- **Panel ids** should come from `crypto.getRandomValues`, not
  `randomUUID`: `randomUUID` needs a secure context, and that may not
  hold on `capacitor://`.

## Open questions for the owner

1. The web app's demo:
   - its content: the `lumiere-demo` knowledge base, which is private
     until the math fixes land, or a small new demo vault;
   - whether edits persist in OPFS (my plan) or reset on reload.
2. Where `apps/web` is hosted (GitHub Pages under a subpath?). This
   decides the asset base and the service worker's scope.

## Follow-ups found (not fixed)

- host-node's `WorkspaceFiles.writeText` opens with
  `O_WRONLY|O_TRUNC|O_NOFOLLOW` and no `O_CREAT`, so creating a new file
  fails outside VS Code. For example, the Scratch Note command
  (`plugins/scratch/run.ts`). It needs its own commit and a unit test.
- `packages/markdown/scripts/measure-vault.ts` passes a relative worker
  path, which Node's `Worker` refuses, so it has always measured parsing
  in the host. I kept that as it was.

## How to resume

```bash
cd /Users/t04dj14n9/Code/vscode-workshop/lumiere-web
git log --oneline claude/lumiere-on-dsh..HEAD   # the 7 commits above
git fetch origin && git merge origin/claude/lumiere-on-dsh
pnpm check                                       # ~1.5 min; passed on e22ea59f
pnpm test:browser && pnpm test:vscode            # not yet run; one at a time
```

The sibling worktrees (`lumiere-desktop-m4`, `lumiere-desktop-pdf`,
`lumiere-ipad`) had no commits when I looked. Merge often: the desktop
sessions edit host-node and `packages/app/src/shell`, which Phase 2 moves.
The contract changes above affect them too:
- desktop-m4's real Git must implement `GitAccess.sourceOf`;
- any host must provide `Extensions.workers`.
