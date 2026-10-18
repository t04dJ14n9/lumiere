# Web build and browser demo: design

Status: **proposal, awaiting the owner's approval** (18 October 2026).
Branch `claude/web-extension`. Nothing below is built yet.

Goal: the extension runs as a VS Code web extension (vscode.dev, github.dev,
and Codespaces in a browser), and a static "try it in your browser" page on
GitHub Pages runs VS Code for the Web with the extension built in and a demo
knowledge base open. No server, no login; a visitor's edits stay in their tab
and reset on reload.

This document never names the extension: the demo tooling reads the ID,
display name and editor view types from the extension's own `package.json`,
so the rename can land independently.

## 1. Two entry points, one plugin tree

`package.json` keeps `"main": "./dist/extension.js"` and gains
`"browser": "./dist/web/extension.js"`. No `extensionKind`: it stays a
workspace extension, so on a remote (SSH, Codespaces) it runs remotely with
`main`, and with no remote (vscode.dev, github.dev) VS Code loads `browser`
in its web-worker extension host.

The two products differ only in a **platform** object, built by the
composition root and passed down. Plugins never test `isWeb`, `process` or
`typeof Worker`.

```
src/extension.ts       desktop root: activateWorkshop(context, nodePlatform(context))
src/extension.web.ts   browser root: activateWorkshop(context, webPlatform(context))
src/activate.ts        the shared body of today's activate()
src/platform/node.ts   Node implementations (today's code, moved, unchanged)
src/platform/web.ts    browser implementations
```

The platform is a set of narrow interfaces. Each is either provided to the
plugin tree as a service (plugins inject it, tests fake it) or handed to a
host adapter that already exists (`createHostServices`, `createVaultSystem`).
A desktop-only capability is an **absent service**, so the plugins that
require it simply do not start (Cordis starts a plugin only when its
injected services exist).

| Interface | Node | Web | Used by |
| --- | --- | --- | --- |
| `WorkerLauncher`: start a bundled worker, post/receive, terminate | `worker_threads`, `*.cjs`, memory cap | `Worker` on `*.js` (VS Code shims nested workers via `importScripts`, so worker bundles are classic IIFE scripts) | vault parser, search runner |
| `Digests`: sync SHA-256 and HMAC-SHA-256 | `node:crypto` | `@noble/hashes` (MIT, audited, ~10 KB) | document fingerprint, vault hashes, link tickets, PDF/region hashes |
| `RealPaths`: resolve symlinks of `file:` URIs | `fs.realpath` | absent: the existing virtual-path walk (`workspace.fs.stat` per component, symlinks refused) applies | Markdown navigation, resource containment, PDF native links |
| `AgentFiles`: temp dir for agent scratch files and IDE-context publishing | `os.tmpdir()` + `fs` | absent: the copy-to-clipboard paths that exist today | `agentHost.writeScratchFile`, both `ideContext` plugins |
| `RegionFiles`: the region-snapshot cache's file operations | `fs` (today's `CacheFiles`, grown) | `workspace.fs` in `globalStorageUri` | `pdfRegions` |
| `git` host service | `vscode.git` + `git blame` | absent | Git gutter, inline, diff editor, blame |
| `os` | `process.platform` | `navigator.userAgent` | PDF status-bar key labels, PDF Look Up |

Random values need no interface: `crypto.getRandomValues` and
`crypto.randomUUID` are global in Node 22 and in browsers, so nonces and IDs
become pure helpers.

### What changes, file by file

Worker threads become web workers behind `WorkerLauncher`:

- `markdown/src/host/vault-parser.ts`, `plugins/search/runner.ts`: take a
  launcher instead of a path. The search runner's one-worker-per-query
  timeouts stay; browsers have no `resourceLimits`, so on the web the 256 MB
  cap is replaced by the existing timeouts alone.
- `workers/search.ts`, `workers/vault.ts`: the logic moves to
  `startSearchWorker(port)` / `startVaultWorker(port)`; a two-line entry per
  platform supplies the port (`parentPort` or `self`). The build emits
  `workers/*.cjs` (Node) and `workers/*.js` (browser).

Desktop-only, not registered on the web:

- `markdown/src/host/git-blame.ts` (spawns `git`), with `git.ts` and
  `git-discovered-watch.ts` (`fs.watch`): the web platform provides no `git`
  service. The four Git features are also switched off in the webview half
  through the feature switch (a manifest `requires: ["git"]`), so no webview
  waits on a host that never starts.
- `pdf/src/extension/plugins/agentBridge/**` and `pdf/src/bridge-stdio`:
  the PDF catalog splits into portable and desktop-only lists; the web root
  registers only the portable ones, and the lazy MCP server is never in the
  browser bundle.

Moved to `vscode.workspace.fs`, host services or pure helpers:

| File | Today | Change |
| --- | --- | --- |
| `host/navigation.ts` | `realpath`, `path.posix.relative` | pure `isInside(rootPath, targetPath)` + `RealPaths` |
| `plugins/resources/containment.ts` | same, plus `fileURLToPath` | same |
| `pdf/plugins/pdf/native-links.ts` | `realpath`; refuses non-`file:` | same helper; virtual schemes get the Markdown rule (see §6, question 4) |
| `host/services/agents.ts` | scratch files in `os.tmpdir()` | `AgentFiles`; absent on the web |
| `ideContext/host.ts` (Markdown), `ideContext/plugin.ts` (PDF) | Node `TempFs` | `AgentFiles`; Copy IDE Context works everywhere |
| `pdfRegions/region-images.ts` | `fs`, `Buffer`, `createHash` | `RegionFiles` + `Digests` + pure base64 |
| `host/vault-system.ts` | `createHash`, `__dirname` | `Digests`; worker found via `extensionUri` |
| `host/link-tickets.ts`, `pdf/link-tickets.ts` | `createHmac`, `Buffer` base64url | `Digests` + pure base64url, constant-time compare helper |
| `host/services/documents.ts`, `pdf/source.ts` | `createHash` | `Digests` |
| `editor-panels.ts`, `diff-views.ts`, `graph/html.ts`, `editor/webview-html.ts`, `pdf/view-id.ts`, `pdf/webview-html.ts` | `randomUUID`, `randomBytes` | Web Crypto globals via pure helpers |
| `file-rename.ts`, `pdf/commands.ts`, `pdf/source.ts`, `ideContext/file-uri.ts` ×2, `diff-resources.ts` | `node:path`, `node:url` | URI path helpers (`Uri.joinPath`, pure posix helpers) |
| `diff-image-url.ts`, `onlineVideos/details.ts`, `ideContext/delivery.ts` ×2 | `Buffer` | pure base64 / `TextEncoder` |
| `pdfToolbar/status-bar.ts`, `pdfLookUp/plugin.ts` | `process.platform` | `os` from the platform |

Desktop behaviour stays identical: the Node implementations are today's code
moved behind the interfaces. Each move is its own commit; anything that turns
out to change behaviour gets its own commit and unit test (AGENTS.md).

### Build

`scripts/build.mjs` adds a browser pass: `src/extension.web.ts` →
`dist/web/extension.js` (`platform: "browser"`, CommonJS, `vscode` external),
and builds the workers twice. A guard plugin fails the browser build on any
Node built-in, `process`, `Buffer` or `__dirname`. Webview bundles are
already browser code and are shared by both builds unchanged. `.vscodeignore`
already ships `dist/**/*.js`; the VSIX grows by the web host bundle (~1 MB).

Commands of desktop-only plugins disappear from the palette by themselves
(their `markdownWorkshop.plugin.<id>` context key is never set). PDF's
hand-written `contributes.json` adds `!isWeb` to the agent-bridge commands
and menus.

## 2. What works where

| Works on the web (and desktop) | Desktop only |
| --- | --- |
| Live Preview editing: wikilinks, embeds, callouts, math, Mermaid, tables, tags, properties, footnotes, code blocks, Vim | Git gutter, Git inline, Git diff editor, Git blame (no `vscode.git`, no `git` binary) |
| Vault index, backlinks, outgoing links, outline, graph, tags view, quick switcher, vault search (in a web worker), link updates on rename | PDF agent bridge: MCP server, PDF Copy Link for Agent, selection envelope, `bridge-stdio` |
| PDF viewer (EmbedPDF + PDFium WASM in the webview), PDF outline, page/zoom/find, history, zen, regions, settings, PDF links from notes (`[[paper.pdf#page=3]]`) | Handing selections to Claude Code / Codex chats (not web extensions), agent scratch files, IDE-context temp files |
| Copy IDE Context and Markdown Copy Link for Agent (clipboard) | Cursor: Chat (Cmd+L), Edit (Cmd+K), agent handoff (Cursor only, not VS Code at all) |
| PDF Look Up on a Mac browser, if the browser hands `dict://` to the Dictionary app (to verify; otherwise it stays off) | Symlink checks (browser file systems have no symlinks; the virtual-path rule applies) |

Other web limits: no 256 MB memory cap on search workers (timeouts still stop
a runaway query); outside changes to files are seen only as far as the file
system provider reports them (vscode.dev's local-folder access does not
watch); a PDF reloads on outside change only for `file:` URIs, as today.

## 3. Testing

Existing suites keep passing unchanged: `pnpm check`, `pnpm test:browser`,
`pnpm test:vscode` all use the desktop entry. New coverage follows the
testing policy, unit tests first:

- Unit tests: both `WorkerLauncher`s against a fake worker (start data,
  replies, crash, terminate); `Digests` parity between `node:crypto` and
  `@noble/hashes` on fixed vectors; the pure containment and base64 helpers;
  `RegionFiles` over a fake `workspace.fs`; the web root's plugin set (no
  Git, no PDF agent bridge) using `fakeHost`.
- In `pnpm check`: a unit test bundles `src/extension.web.ts` in memory with
  the browser guard, so a Node import added anywhere in a portable plugin
  fails the check, not the demo.
- **Needs your approval** (AGENTS.md: browser regressions only with explicit
  approval): `pnpm test:web`, a short `@vscode/test-web` smoke suite in
  headless Chromium, local-only like `test:vscode`. It activates the
  extension in the web-worker host, opens a note in Live Preview, follows a
  wikilink, renders math and Mermaid, opens a PDF at page 3 from a link, and
  runs a vault search. It uses test-web's stock web build as a development
  tool; the shipped demo uses Code-OSS.
- Demo check: `demo/web/verify.mjs` (Playwright) against the static output on
  a local static server: the page loads with no console errors, the landing
  note opens in Live Preview, a wikilink and a PDF link open, an edit survives
  closing the tab's editor and disappears on reload. Run by hand before a
  publish, not in CI.

## 4. The GitHub Pages demo

Tooling lives in `demo/web/` in this repository; build output goes to
`demo/web/dist/` (git-ignored). Nothing is pushed or published without your
go-ahead.

**VS Code for the Web from Code-OSS.** `demo/web/build-code-oss.sh` clones
`microsoft/vscode` at a release tag (1.142.0 today, commit pinned), runs
`npm ci && npm run gulp vscode-web-min`, and caches the result under `.cache/`
(first build ~20–40 min). That is the MIT-licensed source with Code-OSS's own
`product.json`: no Microsoft branding, no marketplace (its terms forbid
non-Microsoft products, and nothing needs installing), telemetry off. Our
`index.html` calls the workbench's `create()` with:

- `folderUri: demo:/` (the knowledge base, below);
- `additionalBuiltinExtensions`: the extension, unpacked from a production
  VSIX, plus the small `demo-vault` file-system extension;
- `configurationDefaults`: open `*.md` with the extension's editor (view type
  read from its manifest);
- `defaultLayout.editors`: the landing note.

**Webview frames: one decision for you.** VS Code serves each webview's
host page (`pre/index.html`) from a subdomain derived from the page's origin
and checks it (a SHA-256 of the parent origin and a per-view salt), so
webviews need wildcard subdomains. GitHub Pages cannot serve those. Code-OSS's
own `product.json` points this at `https://{{uuid}}.vscode-cdn.net/…/pre/`.
Options:

1. *(Recommended)* Keep Code-OSS's default, pinned to `stable/<our commit>`:
   the CDN serves the same MIT files as our build's `pre/` folder (checked:
   it serves 1.142.0's with `cross-origin-resource-policy: cross-origin` and
   no frame restrictions). The build verifies the bytes match ours. Cost: the
   demo depends on that Microsoft CDN for webview frames only.
2. A static host with a custom domain and wildcard TLS (not GitHub Pages).
3. Patch `pre/index.html` to run same-origin. Rejected: webview content
   would share the workbench's origin and storage.

The web-worker extension host runs in a same-origin iframe (VS Code logs a
warning without `webEndpointUrlTemplate`). That is acceptable here: only the
built-in extensions and ours run, and there is no marketplace.

**The knowledge base in the browser.** `demo-vault` (~150 lines, ours) is a
built-in web extension that registers a `FileSystemProvider` for `demo:`
and activates on `onFileSystem:demo`. It reads `kb/index.json` (paths, sizes,
times), fetches a file's bytes from the Pages site on first read, and keeps
writes in memory: edits last for the tab and vanish on reload. The workbench
still remembers layout and open editors per browser, which reopen from the
fresh files. Quick Open and Find in Files over a custom scheme need the
proposed `fileSearchProvider`/`textSearchProvider` APIs; the demo enables
them for `demo-vault` only, through `extensionEnabledApiProposals` (as
test-web does). The extension's own quick switcher and vault search work
without them.

The content is the knowledge base the Codespaces demo session is writing,
shared with that demo (still provisional; it will name a commit to pin once
it is checked). Source: the `lumiere-demo` working copy beside this
repository, everything except its Codespaces packaging (`.devcontainer/`,
`.vscode/`, `README.md`): `Start here.md`, the OKF bundle
`llm-from-scratch/` (~20–25 original notes), `assets/papers/*.pdf` (5–6
CC-BY 4.0 arXiv papers), `assets/images/*.svg`, `ATTRIBUTION.md`, `LICENSE`.
About 6.5 MB, nearly all of it PDFs. Nothing from your own vaults. The build
takes the source folder as an argument, so it never hard-codes the path.

**Landing note.** `About this demo.md`, a demo-only overlay added at build
time and opened at start, so the shared knowledge base stays neutral. It
says: everything runs in your browser, no account, no server; your edits
vanish when you reload; what needs desktop VS Code (Git features, the PDF
agent bridge and agent hand-off) and what is Cursor-only (Chat, Edit, agent
handoff); how to install the extension. Its first line links to
`Start here.md`, the knowledge base's own tour.

**Size and caching.** Estimates, to be replaced by measured numbers in the
build log:

| Part | On disk | First load |
| --- | --- | --- |
| Code-OSS `vscode-web-min`, built-in extensions pruned to the web ones the demo needs | ~25 MB | ~5 MB gzipped |
| The extension (production VSIX contents) | ~19 MB | ~1–2 MB (editor bundle); Mermaid, MathJax, PDFium load on demand |
| Knowledge base | ~6.5 MB (5–6 PDFs, ~25 notes) | `index.json` + the notes the vault index reads (~100 KB); a PDF only when opened |

GitHub Pages: 1 GB per site, 100 MB per file, ~100 GB/month soft bandwidth;
it gzips text and sends `Cache-Control: max-age=600` on everything, which we
cannot change. So the build puts Code-OSS under `/vscode/<commit>/` and the
extension under `/ext/<version>/`: a deploy never mixes old and new files,
and repeat visits revalidate cheaply with ETags.

## 5. vscode.dev and github.dev

Once a release with the `browser` entry is published (your call), the
Marketplace and Open VSX list it as a web extension, and users can install it
on vscode.dev and github.dev. There the workspace is `vscode-vfs://` (GitHub
repositories) or `file:` (a local folder via the browser's File System
Access); both go through `workspace.fs`, which every portable plugin already
uses.

## 6. Plan and questions

Phases, each committed with `pnpm check` (plus `test:browser` and
`test:vscode` for A and B, run sequentially):

- A. Platform seams on desktop only: pure helpers, interfaces, Node
  implementations, `activateWorkshop`. No behaviour change.
- B. Browser entry: `webPlatform`, browser and worker builds, guard test,
  catalog split, `!isWeb` contributions; tried in test-web.
- C. Demo: Code-OSS build script, `demo-vault`, `index.html`, knowledge-base
  import, landing note, `verify.mjs`; measured sizes recorded here.
- D. Stop. Ask before pushing, publishing, creating a GitHub repo or enabling
  Pages.

Questions:

1. Webview frames: option 1 (pinned `vscode-cdn.net`, recommended), or do
   you want a custom-domain host?
2. May I add `pnpm test:web` (the `@vscode/test-web` smoke suite above)?
3. May I add `@noble/hashes` as a runtime dependency for the web digests?
4. PDF links in plain text editors (`native-links.ts`) refuse non-`file:`
   workspaces today. On the web they must accept the workspace's scheme. Use
   Markdown's virtual-path rule on desktop too (a small behaviour change for
   virtual workspaces, in its own commit), or keep desktop as is?
