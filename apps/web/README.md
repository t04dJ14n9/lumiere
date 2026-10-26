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

## Files

- `src/main.ts`: mounts the vaults and starts host-web and the window.
- `src/handle-fs.ts`: a vault in a folder handle (picked, or private storage).
- `src/folders.ts`: picking folders, and remembering them.
- `src/demo.ts`: the demo vault.
- `index.html`: the page and its content security policy, which a note's
  blob: page keeps too.
- `public/sw.js`, `public/manifest.webmanifest`: offline, and installing.
- `scripts/build.mjs`: the build.

## Limits

- Images in notes do not show yet.
- PDFs do not open in tabs yet.
- No Git. A vault's Obsidian community plugins run only after the reader
  says yes, once per vault, as in the desktop app.
