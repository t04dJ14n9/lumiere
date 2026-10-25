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
        └─ packages/host-node          Node's host services, editor routes, tree views,
             │                         page shim, embedding/palette/views contracts
             ├─ packages/dsh           host-node's routes on DSH's server + DSH's preview plugin
             └─ packages/app           Lumière's server (auth, API) + the window (React)
                  └─ apps/desktop      Tauri: native window, menu, picker, Finder; nothing else
```

Arrows point one way only. The `architecture/boundaries` lint rule enforces
it:

- host-node imports no embedder and no `vscode`;
- embedders import host-node only through its four public entries;
- the app knows nothing of DSH.

Where each kind of work belongs:

| If the change is about | It goes in |
| --- | --- |
| how a note edits, renders or links | the plugin (`packages/markdown/src/plugins/<id>`), for every host at once |
| a host service outside VS Code (files, settings, dialogs, trees) | `packages/host-node/src/host` |
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
| Page ↔ host socket | `packages/host-node/src/protocol.ts` | page shim ↔ panels |
| Embedder ↔ page | `packages/host-node/src/embedding.ts` | DSH client, app window ↔ page shim |
| Theme | `packages/host-node/src/palette.ts` | DSH client, app window → page |
| Tree views | `packages/host-node/src/views.ts` | host-node ↔ app window (DSH later) |
| Server process | `packages/app/src/server/contract.ts` | server ↔ `apps/desktop/src-tauri/src/server.rs` |
| Server API | `packages/app/src/server/api.ts` (table in its README) | server ↔ window, desktop |
| Window ↔ Tauri | `packages/app/src/shell/tauri.ts` | window ↔ `capabilities/shell.json`, `menu.rs` |
| Vault code trust | `VaultCodeTrust` in `packages/markdown/src/shared/host/workspace.ts` | plugins ↔ VS Code adapter, host-node ← app |

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
  - give `packages/pdf` a host-services seam like Markdown's: a portable
    entry, and a layers test that fails if `vscode` is reachable;
  - serve its viewer from host-node as `/lumiere/pdf`;
  - `FileTree` stops disabling `.pdf`, and a PDF tab is an `EditorFrame`
    on that route;
  - DSH registers it for `.pdf`.
- **M6, Git outside VS Code (Claude):** `GitAccess` over the `git` CLI, for
  blame and the change gutter in DSH and the app.
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
10. **Vault plugins.** In a second throwaway vault, never the owner's, with
    one harmless plugin that marks the page:

    ```bash
    v=/tmp/lumiere-plugin-vault; p=$v/.obsidian/plugins/hello-test
    mkdir -p "$p" && echo '# One' > "$v/One.md" && echo '# Two' > "$v/Two.md"
    echo '["hello-test"]' > "$v/.obsidian/community-plugins.json"
    echo '{"id":"hello-test","name":"Hello Test","version":"1.0.0"}' > "$p/manifest.json"
    cat > "$p/main.js" <<'EOF'
    const { Plugin, Notice } = require("obsidian");
    module.exports = class extends Plugin {
      onload() {
        document.documentElement.dataset.helloTest = "on";
        new Notice("Hello Test is on");
      }
    };
    EOF
    ```

    - Opening a note asks once, even with both notes open. Keep Them Off
      has the focus.
    - Keep Them Off: no notice, and `data-hello-test` is missing from the
      note's `<html>`. After a relaunch nothing asks, and
      `/tmp/lumiere-dev/trust.json` holds the answer.
    - Open Obsidian Community Plugins Marketplace asks again after a no.
    - Trust and Turn On: the notice shows in every open note of the vault
      without reopening it.
    - A copy of the vault at another path is asked about separately.
    - DSH on the same vault never asks and never runs the plugin.
    - VS Code and Cursor follow workspace trust: in Restricted Mode the
      plugin stays off, and trusting the folder turns it on.
11. **Errors.** Rename the vault folder while it is open, or start with a
   broken `LUMIERE_SERVER`: a message appears, never a blank window.

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
   page's CSP needs review.
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
