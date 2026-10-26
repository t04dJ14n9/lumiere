# Lumière for the web

Lumière in a browser, with no server: the desktop app's window and Lumière's
plugins (host-web) in one static site. It works offline once loaded, and can
be installed as an app.

```bash
pnpm --filter @workshop/web build   # dist/: any static web server, under any path
```

Vaults are:

- folders the reader picks (Chromium's File System Access API), remembered
  between visits;
- kept in the browser: its private storage where a page can write it
  (Chromium), else IndexedDB (Safari, Firefox).

A first visit opens a short demo vault; later visits reopen the last vault.

## How it works

Only the window can read the vaults, so the service worker asks it for what
the worker cannot have, over `postMessage` with a port for the answer. A
note's page is served this way at `lumiere/page/<id>` while its tab is open
(a blob: page where no worker answers yet, as on a first visit). Chromium
puts no blob: page under the service worker, so a served page is what lets
the page's own requests, the editor's files offline among them, reach it.

## Files

- `src/main.ts`: mounts the vaults and starts host-web and the window.
- `src/handle-fs.ts`: a vault in a folder handle (picked, or private storage).
- `src/folders.ts`: picking folders, and remembering them.
- `src/demo.ts`: the demo vault.
- `src/note-pages.ts`: notes' pages, which the service worker serves while
  their tabs are open.
- `src/answers.ts`: what the window answers the service worker.
- `src/shared/routes.ts`: the URLs the worker answers by asking the window.
- `src/shared/messages.ts`: what the worker asks the window, and its answers.
- `index.html`: the page and its content security policy, which a note's
  page keeps too.
- `src/worker/sw.ts`: the service worker (built into `sw.js`): offline, and
  the routes above. `windows.ts` asks the app's windows; `responses.ts`
  answers the page.
- `public/manifest.webmanifest`, `public/icon.svg`: installing.
- `scripts/build.mjs`: the build.

## Limits

- Images in notes do not show yet.
- PDFs do not open in tabs yet.
- No Git. A vault's Obsidian community plugins run only after the reader
  says yes, once per vault, as in the desktop app.
