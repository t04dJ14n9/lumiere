# Lumière on three hosts: VS Code, DeepSeek Harness and a desktop app

Status: 2026-10-22, after the desktop skeleton. Owner: t04dJ14n9.

Who does what:

- **Claude:** the architecture, host code and contracts, with their unit and
  integration tests.
- **Grok Bot:** testing in the real apps (DSH, the desktop app, Cursor),
  fixing what it finds, and the build, signing and release work. Computer
  use cannot type into an IDE, so testing that needs a keyboard is Grok
  Bot's.

Read [AGENTS.md](../AGENTS.md) first. Grok Bot: start at section 6.

## 1. Goal

One Lumière, three hosts, the same plugins in each:

| Host | What runs it | State |
| --- | --- | --- |
| VS Code and Cursor | the extension (`t04dj14n9.lumiere`) | shipping |
| DeepSeek Harness (DSH) 0.2.1+ | a DSH bundle (`packages/dsh`) | Markdown works; PR #265 |
| Lumière desktop | Tauri around Lumière's own server (`apps/desktop`, `packages/app`) | skeleton works on macOS |

The desktop app is meant to feel like Typora: a light reader and editor for
Markdown and PDF, laid out as VS Code: files on the left, the note's outline
on the right, notes in tabs, Settings with ⌘, and a light or dark theme, and
little else. It is not an IDE. Agents, Git and the terminal stay
in VS Code and Cursor.

## 2. Where things stand

### PR #265: Lumière in DSH (open)

- The Markdown editor works in DSH 0.2.1-rc.2:
  - notes open and save as you type;
  - links open new tabs;
  - DSH's light and dark themes are followed.
- Grok Bot's `887e510e` keeps file access inside the workspace:
  - containment as VS Code does it, symlinks included;
  - a filesystem root is refused as a workspace;
  - safe external-link schemes;
  - no stale disk read during a save.
- CI is green.
- Still to do:
  - [ ] Repeat the DSH end-to-end check on `887e510e`. #296 changed links:
    a plain click now reveals, Mod-click follows.
  - [ ] Review and merge.

### The desktop skeleton (this PR, stacked on #265)

What exists, each part with unit tests:

- **`packages/host-node`**: the Node host, moved out of `packages/dsh` so
  DSH and the app share it. New in it:
  - the plugins' tree views, served at `/lumiere/views` (Outline,
    Backlinks, Tags, Outgoing Links);
  - one palette that themes the editor for every embedder;
  - "you are shown", so the shown tab is the active note;
  - file watching where folders do not exist yet;
  - stopping while pages are open.
- **`packages/app`**: Lumière's own server and the Typora-like window:
  - files on the left, the outline on the right, notes and Settings in
    tabs, Color Theme, and the layout kept between launches;
  - a token, Host and Origin check on every request;
  - the contract `apps/desktop` depends on.
- **`apps/desktop`**: the Tauri 2 shell:
  - starts the server and opens its window;
  - the menu: Settings… (⌘,), Open Folder… (⌘O), Close Tab (⌘W), Toggle
    Sidebar (⌘B), Toggle Outline (⌥⌘B), Color Theme;
  - the native folder picker, and a dark title bar with a dark theme;
  - notes from Finder, the command line or a second launch;
  - single instance;
  - stops the server on quit;
  - an error page when the server will not start.

Checked by hand on macOS:

- In a browser on the server:
  - open a vault and a note;
  - type, and the file on disk changes;
  - Mod-click a wikilink, and a tab opens;
  - the outline follows the shown tab, and clicking a heading scrolls to it;
  - a wrong folder shows an error;
  - SIGTERM with pages open exits in about 0.4 s.
- In the Tauri debug build:
  - the window opens on a vault given at launch;
  - a second launch with a note opens it in a tab;
  - killing the app stops the server.

Not checked yet (Grok Bot, section 6):

- the menu and folder picker inside Tauri;
- typing in WKWebView;
- Finder's Open With on a bundled build;
- the bundled build itself (`pnpm --filter @workshop/desktop build`
  downloads Node from nodejs.org).

### Failures already on `main`

These are not caused by #265 or this PR:

- Browser: `tags-wrap-estimated-height.spec.ts`.
- Real VS Code:
  - `font-size.spec.ts`;
  - `vim-caret-vscodevim.spec.ts`;
  - `vim-caret.spec.ts`.

### Elsewhere

- **Home-server demo:** waits for the owner to approve Tailscale Funnel. The
  scripts are in `scripts/demo-server/` (not committed).
- **Not started:**
  - triage of the open card PRs;
  - graph-view parity with Obsidian;
  - the full test pass;
  - the README motivation rewrite.

## 3. Architecture

```text
packages/core, agents, markdown, pdf   the plugins: the same in every host
        │
        ├─ packages/markdown/src/host  VS Code's host services (the extension)
        │
        └─ packages/host-node          the shared host (src/core.ts: no Node), on Node's
             │                         platform; editor routes, tree views, page shim,
             │                         embedding/palette/views contracts
             ├─ packages/host-web      the shared host on a browser's folders (no Node)
             ├─ packages/dsh           host-node's routes on DSH's server + DSH's preview plugin
             └─ packages/app           the window (React) over a WindowBackend: Lumière's
                  │                    server over HTTP (src/server), or host-web in the
                  │                    same page (src/local)
                  ├─ apps/desktop      Tauri: native window, menu, picker, Finder; nothing else
                  └─ apps/web          a static site: the window on host-web, offline; its
                                       service worker serves notes' pages and their files
```

Arrows point one way only. The `architecture/boundaries` lint rule enforces
it:

- host-node and host-web import no embedder and no `vscode`;
- embedders import host-node only through its public entries; host-web
  uses only `@workshop/host-node/core` (and `/embedding`), which a test
  bundles for a browser and fails on any Node built-in;
- the app knows nothing of DSH.

The shared host is written once against `HostPlatform`
(`packages/host-node/src/host/platform.ts`): files named by `file:` URIs, a
small store, workers and SHA-256. Node's platform keeps the real-path
containment and no-follow writes; host-web mounts `VaultFileSystem`s (memory,
a folder handle, IndexedDB, the iPad's native files) at absolute paths. It
lives inside host-node until the PRs open on those files land, then moves to
its own package.

Where each kind of work belongs:

| If the change is about | It goes in |
| --- | --- |
| how a note edits, renders or links | the plugin (`packages/markdown/src/plugins/<id>`), for every host at once |
| a host service outside VS Code (files, settings, dialogs, trees) | `packages/host-node/src/host`, over `HostPlatform` |
| a browser's or the iPad's files, workers or pages | `packages/host-web` |
| what a page and its embedder say to each other | `packages/host-node/src/embedding.ts` (both sides read it) |
| the desktop window: sidebar, tabs, menus as the page sees them | `packages/app/src/shell` |
| vaults, files, auth, the API | `packages/app/src/server` |
| something only a native app can do (menu, picker, Finder, dock, updates) | `apps/desktop/src-tauri` |
| DSH's sidebar, addresses, theme tokens | `packages/dsh` |

A fix in the wrong layer works in one host and drifts from the others. When
the desktop app shows a Markdown bug, fix it in the plugin. VS Code and DSH
then get the fix too.

## 4. The contracts

Each contract is written once, in code. Change both sides in the same PR.

| Contract | Written in | Sides |
| --- | --- | --- |
| Host services | `packages/markdown/src/shared/host` | plugins ↔ VS Code adapter, host-node |
| Host platform | `packages/host-node/src/host/platform.ts` | shared host ↔ Node's platform, host-web |
| Page ↔ host socket | `packages/host-node/src/protocol.ts` | page shim ↔ panels, over a socket or a `MessagePort` |
| Embedder ↔ page | `packages/host-node/src/embedding.ts` | DSH client, app window ↔ page shim (also `connect`/`port` for a channel) |
| Window ↔ its host | `packages/app/src/shell/backend.ts` (`WindowBackend`) | window ↔ `http-backend.ts`, `src/local` |
| A vault's folder in a browser | `packages/host-web/src/vault-fs.ts` (`VaultFileSystem`) | host-web ↔ apps/web, the iPad's native files |
| Web app's worker ↔ window | `apps/web/src/shared/routes.ts`, `messages.ts` | `apps/web/src/worker` ↔ `src/answers.ts`: notes' pages and the files they show |
| Theme | `packages/host-node/src/palette.ts` | DSH client, app window → page |
| Tree views | `packages/host-node/src/views.ts` | host-node ↔ app window (DSH later) |
| Server process | `packages/app/src/server/contract.ts` | server ↔ `apps/desktop/src-tauri/src/server.rs` |
| Server API | `packages/app/src/server/api.ts` (table in its README) | server ↔ window, desktop |
| Window ↔ Tauri | `packages/app/src/shell/tauri.ts` | window ↔ `capabilities/shell.json`, `menu.rs` |

| Vault code trust | `VaultCodeTrust` in `packages/markdown/src/shared/host/workspace.ts` | plugins ↔ VS Code adapter, host-node ← app |
| Drawings for the window | `packages/app/src/server/ink.ts` (`InkWaiting`, the `ink` service on `@workshop/ink/service`) | plugins → server → window's canvas (`src/shell/ink.ts`, `@workshop/ink/canvas`) |
A vault's own code (Obsidian community plugins) runs only where the owner
said yes. The plugins ask `HostWorkspace.vaultCode`: its answer for a vault,
a request to ask, and a change event. Vaults are named by root URI.
- VS Code answers with workspace trust (Restricted Mode) and never asks
  itself.
- host-node takes the embedder's answer as `StartOptions.vaultCode`. An
  embedder that cannot ask leaves it out and gets `noVaultCode` (`inert.ts`):
  every vault refused, nobody asked. DSH does this.
- The app asks once per vault (`vault-trust.ts`). A waiting question reaches
  the window as the `{"type":"trust"}` event on `GET /api/events`; the window
  reads the questions with `GET /api/trust` and posts the answer to
  `POST /api/trust` `{"vault","allowed"}`, accepted only for a vault that
  asked. Answers are kept in `trust.json` in the data folder.
- `isTrusted()` stays true outside VS Code: it covers remote images and
  media, not a vault's code.

## 5. Milestones

Each milestone is a PR with its own tests. `pnpm check` passes before every
push. `pnpm check:desktop` also passes when `apps/desktop` changed.

- **M0, PR #265 (Grok Bot):** the DSH end-to-end check on the current head,
  then review and merge.
- **M1, M2, M3 (done here):** host-node, the app server and window, and the
  Tauri skeleton.
- **M4, a usable desktop app:**
  - *Grok Bot, in the app:*
    - the section 6 pass;
    - copy and paste, IME and Vim keys in WKWebView;
    - window size and position remembered;
    - Open Recent in the menu, from `GET /api/vaults`;
    - a "Lumière stopped" page with Restart when the server dies.
  - *Claude:*
    - Backlinks and Tags as sidebar tabs: one `TreePanel` each;
    - the same trees as DSH sidebar tabs;
    - a status bar from `views.status()` (word count);
    - a command palette from `contributes.commands`, with Go to Heading and
      the quick switcher;
    - a WebKit run of the Markdown browser suite.
- **M5, PDF in tabs (Claude):**
  - *Done, for viewing:* `@workshop/pdf/portable` gives host-node the viewer
    core (`src/host` cannot reach `vscode`); host-node serves the viewer as
    `/lumiere/pdf` over the notes' page shim and socket; `FileTree` opens
    `.pdf`, a PDF tab is an `EditorFrame` on that route, and the desktop app
    opens PDFs from Finder.
  - *Later:* the PDF plugins outside VS Code (Copy Link for Agent, look up,
    the outline view, history), on host contracts kept on branch
    `claude/lumiere-pdf-plugins-later`; the PDF settings and right-click
    menu; links in a PDF; DSH registering the viewer for `.pdf`.
- **M6, Git outside VS Code (Claude, done):** `GitAccess` over the `git`
  CLI, for blame and the change gutter in DSH and the app
  (`packages/host-node/src/host/git.ts`, built from the VS Code adapter's
  command-line half). host-node now offers "git", so those plugins'
  settings show. Still VS Code's only: the rendered diff editor, which also
  needs the window. Section 6, step 12, checks it by hand.
- **M7, releases (Grok Bot, with the owner's credentials):**
  - macOS signing and notarisation (hardened runtime with `allow-jit` for
    Node), and Windows signing;
  - installers;
  - updates (`tauri-plugin-updater`);
  - a release workflow on tags;
  - publishing the DSH bundle;
  - moving the home-server demo to `lumiere-server` in its sandbox.

## 6. Grok Bot: start here

Set up once:

```bash
git fetch origin && git checkout claude/lumiere-desktop
pnpm install
pnpm check && pnpm check:desktop
```

Rust 1.80 or later. On macOS, Xcode's command-line tools.

Run the desktop app on a **throwaway vault**, never the owner's notes:

```bash
mkdir -p /tmp/lumiere-test-vault && cp -R packages/markdown/test/fixtures/vault/. /tmp/lumiere-test-vault/
LUMIERE_DATA=/tmp/lumiere-dev pnpm --filter @workshop/desktop dev
```

Or run the window in a browser:

```bash
node packages/app/dist/app/server.js --vault /tmp/lumiere-test-vault --data /tmp/lumiere-dev
```

Then open the `url` it prints.

The pass, in the Tauri window:

1. **Open a vault.**
   - File > Open Folder… (Cmd+O) opens the native picker.
   - The vault's files appear. A `.obsidian` folder and `node_modules` stay
     hidden.
   - Folders start closed. Opening a note from a link opens the folders
     above it. After Quit and a new launch, the same folders are open.
2. **Edit.**
   - Open a note and type: the file on disk changes within a second.
   - Undo and redo work.
   - Copy, cut and paste work, from the Edit menu and with the keys.
   - IME (Chinese) input works.
3. **Right-click.**
   - With text selected, the menu offers Copy Link for Agent first, then
     formatting, highlight colours, and Cut, Copy and Paste.
   - Copy Link for Agent puts `@note.md#line` and the passage on the
     clipboard.
   - Without a selection, the selection items are missing.
   - Tables and properties keep their own menus.
4. **Links.**
   - A plain click on a wikilink reveals its source.
   - Mod-click follows it into a new tab.
   - A link to a missing note creates it.
   - An external link opens the system browser.
5. **Outline**, in the right panel.
   - It shows the shown note's headings and follows tab switches.
   - Clicking a heading scrolls to it.
   - Moving the caret highlights its section.
   - Expanding and collapsing work.
6. **Theme.**
   - With Color Theme on Follow System, switch macOS between light and dark:
     the window, its title bar and the editor follow together.
   - View > Color Theme > Dark, and Light: the same, whatever macOS says.
     The choice is still there after a relaunch.
7. **Settings and keys** (VS Code's).
   - ⌘, opens Settings, from the window and from inside a note.
   - Search finds settings; `@modified` lists the changed ones.
   - A change applies to open notes at once (Readable Line Length, Font
     Size), and Reset puts the default back.
   - A refused value (Font Size 99) says why under the field.
   - ⌘W closes the shown tab while others are open, and the window on the
     last one; ⇧⌘W closes the window.
   - ⌘B hides and shows the files; inside a note ⌘B is Bold instead.
   - ⌥⌘B hides and shows the outline.
   - ⌃⇥ goes back to the last tab, also while typing in a note; ⇧⌘] and
     ⇧⌘[ (or ⌥⌘→ and ⌥⌘← around the note) go to the next and previous.
   - The layout is the same after a relaunch.
8. **Finder.**
   - In a bundled build, Open With > Lumière on a `.md` file opens it in a
     tab.
   - With the app already running, the same file goes to the running window.
9. **Quit with unsaved text.** Type, then Cmd+Q at once: the text is on disk.
10. **Errors.** Rename the vault folder while it is open, or start with a
   broken `LUMIERE_SERVER`: a message appears, never a blank window.
12. **Git (M6).** In a throwaway repository, never the owner's notes:

    ```bash
    v=/tmp/lumiere-git-vault; mkdir -p "$v" && cd "$v" && git init -q
    git config user.name Test && git config user.email test@example.com
    printf '# One\n\nfirst line\nsecond line\n' > One.md
    git add One.md && git commit -qm "First"
    ```

    - In the desktop app, Git is off at first: no authorship text or change
      bars. Turn on Git Blame and Git Gutter in Settings (⌘,), then go on.
      DSH starts with them on.
    - Open `One.md` in the desktop app and in DSH. With the caret on "first
      line", quiet text after the line names Test, the time and "First";
      hovering it shows the commit.
    - Type a new line: a change bar marks it added. Change "second line":
      its bar marks it modified. The new line's authorship says it is not
      committed yet.
    - Run `git commit -qam Second` in a terminal: within a second the bars
      go and the changed line names "Second", without reopening the note.
    - Settings lists Current-line authorship, Git change bars and Inline git
      changes, but not Rendered git diff.
    - On a Mac without Xcode's command-line tools (`xcode-select -p`
      fails), opening the note shows no "install the tools" dialog; there
      is just no authorship and no bars.
13. **PDFs (M5).** Put a few PDFs in the throwaway vault, one of them long
    and one with links.
    - Click a PDF in the files: it opens in a tab, fitted to the width, in
      the window's light or dark theme. In a bundled build, Open With ›
      Lumière on a `.pdf` opens it in a tab, as step 8 does for a note.
    - Scroll with the trackpad and the keys; zoom with the toolbar, ⌘ and
      the wheel, and a pinch; find a word (the toolbar's search). Select
      text and copy it with ⌘C.
    - Replace the PDF on disk with another: the tab shows the new one.
    - Close the tab, reopen the PDF: it opens where you left it (until the
      app quits).
    - Known gaps, not bugs: right-click has only the page's own menu, links
      do nothing, and the outline button does nothing.

Report each problem as an issue or a PR. For each fix:

- put it in the layer section 3 names, in its own commit, with a unit test
  (AGENTS.md);
- run `pnpm check` (and `pnpm check:desktop`) before you push;
- open a PR against `claude/lumiere-desktop` while this PR is open, and
  against `main` after.

Do not:

- add Tauri APIs to the window without adding them to `tauri.ts` and
  `capabilities/shell.json` in the same commit;
- add Rust for something the server can do;
- copy host code into `apps/desktop` or `packages/app`. If it belongs to
  every host, it goes in host-node.

## 7. Testing per host

| Layer | VS Code | DSH | Desktop app and web |
| --- | --- | --- | --- |
| Unit (`pnpm check`) | yes | `packages/dsh`, `packages/host-node` | `packages/app` (the server in-process: auth, API, events, stopping); `pnpm check:desktop` (Rust) |
| Browser suites (Chromium) | yes | the same page | the same page; a WebKit run to come (M4) |
| End to end | `pnpm test:vscode` in real VS Code and Cursor | a pinned DSH in a throwaway `DSH_HOME` (by hand) | the section 6 pass (by hand); `packages/app/test/e2e` with Playwright to come |

## 8. Risks

1. **WebKit.** Lumière has only run in Chromium (VS Code, Cursor, DSH).
   WKWebView on macOS and WebKitGTK on Linux may differ. Section 6 and the
   WebKit run find out.
2. **Size and signing of the Node sidecar.** It adds about 40–90 MB and
   needs `allow-jit` on macOS. An official Node binary is bundled; a
   single-executable build is not used, because Homebrew's Node cannot make
   one and the server's workers and ES modules work unchanged without it.
3. **DSH's APIs are a preview.** Pin the tested DSH version. Keep the DSH
   surface in `packages/dsh/src/host/dsh.ts` and the address helpers.
4. **The editor page is same-origin with its embedder.** Its nonce-only
   script policy keeps a note's content from running. Any change to the
   page's CSP needs review. In the web app the service worker serves the
   page, with the window's policy as its first tag, as a blob: page
   inherits it; a vault's SVG is served with a sandbox policy.
5. **Two Cordis versions in DSH's process** (DSH's 4.0.0-rc.7 fork and
   Lumière's rc.11). They coexist because they never share objects. Check
   again whenever either changes.

## 9. Decisions for the owner

1. The bundle identifier `io.github.t04dj14n9.lumiere`, and the app's icon:
   `apps/desktop/src-tauri/icons/source.png` is a placeholder.
2. Signing: who holds an Apple Developer ID and a Windows certificate?
3. Where the DSH bundle is published: npm (`@lumiere/dsh`) or GitHub
   Releases.
4. Whether the home-server demo moves from code-server to `lumiere-server`.
   Recommended: it is lighter and serves only the vault.
