# Lumière's own server and window (`@workshop/app`)

Lumière's editor in a window of its own. This package is what the desktop
app (`apps/desktop`) runs, and it also works on its own in a browser:

```bash
pnpm --filter @workshop/app build
node packages/app/dist/app/server.js --vault /path/to/notes
```

Open the `url` from the line it prints.

## How it works

The **server** (`src/server`) starts Lumière's Markdown plugins through
`@workshop/host-node` and serves three things on a loopback port:

- the window's page;
- its API;
- the editor pages.

Every request must come from the window it was started for (`auth.ts`):

- The launch token arrives once in the URL. It is moved into an HttpOnly,
  SameSite=Strict cookie, and the URL is cleaned by a redirect.
- The Host header must name this server, so a DNS-rebinding page is
  refused.
- A request that has an Origin must come from this server.

The **window** (`src/shell`, React) is meant to feel like Typora: light,
with the note in front.

Laid out as VS Code:

- The vault's files on the left, the shown note's outline on the right.
- Notes open as tabs in the middle. Each tab is an editor page in an
  iframe, sent the theme and told when it is shown
  (`@workshop/host-node/embedding`).
- The outline is the Outline plugin's own tree, served by host-node
  (`@workshop/host-node/views`). Backlinks and Tags can join it the same way
  (`components/OutlinePanel.tsx`).
- Settings opens as a tab, as VS Code's Settings editor: search, groups and a
  control per setting. Lumière's settings come from host-node
  (`@workshop/host-node/settings`), and every write passes the same check as
  in VS Code. Color Theme (Follow System, Light, Dark) is the window's own.

VS Code's keys (`commands.ts`, `KEYS`): ⌘, Settings, ⌘W the shown tab (the
window when it is the last), ⌃⇥ back to the last tab, ⇧⌘] and ⇧⌘[ (or ⌥⌘→
and ⌥⌘←) the next and previous tab, ⌘B the files sidebar, ⌥⌘B the outline,
⌘O Open Folder. The app menu runs the same commands. A key the
editor uses itself, such as ⌘B for Bold while typing, stays the editor's.

The layout and Color Theme are kept by the server (`/api/ui`), because the
window's own storage does not last: its port changes every launch.

Obsidian community plugins that come with a vault run only after the owner
says yes, once per vault, as in Obsidian (`vault-trust.ts`, host-node's
`vaultCode`). The first note opened in a vault that turns plugins on shows a
dialog: Keep Them Off, the default, or Trust and Turn On, which loads them
in every open note of that vault. The answers are kept in `trust.json` in
the data folder. Open Obsidian Community Plugins Marketplace asks again
after a no.

From the desktop app the window uses only the folder picker, menu commands
and the app's light or dark appearance (`tauri.ts`). In a browser it falls
back to a path field.

## The server's contract

`src/server/contract.ts` is the one place it is written in code: the
arguments, the ready line, logs and stopping. `apps/desktop` depends on it.
Change both sides together.

```text
lumiere-server [--vault <dir>]... [--port <n>|0] [--host 127.0.0.1]
               [--token <t>] [--data <dir>] [--assets <dir>] [--version]
```

- **Ready.** Once ready, one JSON line goes to stdout:
  `{"lumiere":"ready","url":…,"port":…,"pid":…,"version":…}`. Nothing else
  ever goes to stdout. Logs go to stderr, as JSON lines.
- **Stopping.** SIGTERM, SIGINT or stdin closing make the server write
  unsaved notes and exit 0, within 5 seconds (exit 1 if stopping hangs).

| Method and path | What |
| --- | --- |
| `GET /` | the window |
| `GET /api/health` | `{"ok":true,"version":…}` |
| `GET /api/vaults`, `POST /api/vaults` `{"path"}` | the open and recent vaults; open one |
| `GET /api/files?vault=` | a vault's files, sorted, with their kind |
| `POST /api/open` `{"path"}` | show a note or folder (Finder, a second launch) |
| `GET /api/events` | server-sent events: vaults changed, a note to open, a vault's plugins waiting for an answer (`{"type":"trust"}`) |
| `GET /api/ui`, `POST /api/ui` | the window's layout and Color Theme (`src/shared/ui-state.ts`) |
| `GET /api/trust`, `POST /api/trust` `{"vault","allowed"}` | the vaults waiting for an answer, with the plugins they turn on; the owner's answer, accepted only for a vault that asked |
| `/lumiere/*` | the editor pages and tree views (`@workshop/host-node`) |

## Files

- `src/server/contract.ts`: arguments, the ready line, logs, exit codes.
- `src/server/cli.ts`: the `lumiere-server` process: start, ready line, stop.
- `src/server/server.ts`: the web server: auth, then the API, editor routes or the window.
- `src/server/auth.ts`: the token, Host and Origin checks.
- `src/server/api.ts`: the API above.
- `src/server/vaults.ts`: open and recent vaults, and their files.
- `src/server/vault-trust.ts`: the owner's answers about running a vault's plugins (`trust.json`), and the questions waiting.
- `src/server/json-file.ts`: writing the data folder's JSON files without leaving half a file.
- `src/shell/App.tsx`, `src/shell/components/`: the window.
- `src/shell/opening.ts`: opening vaults and notes from the picker, menu, links and the server.
- `src/shell/commands.ts`: the window's commands and VS Code's keys for them.
- `src/shell/trust.ts`, `src/shell/components/TrustDialog.tsx`: asking the owner about a vault's plugins, one vault at a time.
- `src/shell/settings.ts`, `src/shell/settings-view.ts`: the settings, and how the Settings tab lays them out.
- `src/shell/ui-state.ts`, `src/shared/ui-state.ts`, `src/server/ui-state.ts`: the layout and Color Theme, kept by the server.
- `src/shell/tabs.ts`, `src/shell/tree.ts`, `src/shell/tree-state.ts`: tabs and tree state, as pure functions.
- `src/shell/api.ts`, `src/shell/views.ts`: the server's API and the tree views, from the window.
- `src/shell/theme.ts`: the window's light and dark palettes, and which one shows.
- `src/shell/tauri.ts`: everything the window asks of the desktop app.
- `scripts/build.mjs`: builds `dist/app/` (the server, the window and host-node's assets).

## Limits

- Markdown only: PDFs are listed but do not open yet.
- One window per server.
