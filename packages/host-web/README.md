# @workshop/host-web

Lumière's host without Node: the shared host (`@workshop/host-node/core`) on
folders a browser or an iPad can reach. The web app (`apps/web`) and the iPad
app run Lumière's plugins in their own window with it.

## How it works

The embedder mounts its folders in a `Mounts` table: each vault, and the
host's own data, is a `VaultFileSystem` at an absolute path such as
`/vaults/Notes`. `Mounts` turns them into the host's files, named by `file:`
URIs written exactly as Node writes them, and tells watchers about every write.
`startHostWeb` starts the plugins on that, with web workers and a synchronous
SHA-256. `openEditorPage` opens a note in a blob: page, or at a URL the
embedder serves it at (`servePage`: the web app's service worker); either
keeps the window's origin. The window hands the page a `MessagePort` to its
panel when the page asks (`{lumiere: "connect"}`), since there is no socket.

There are no symbolic links in these folders, so containment is by path; an
encoded `/` or `\` in a URI is refused.

## Files

- `src/index.ts`: `startHostWeb`, and what an embedder needs.
- `src/vault-fs.ts`: `VaultFileSystem`, a folder by paths relative to it.
- `src/memory-fs.ts`: one in memory; with `persist`, kept elsewhere as it changes.
- `src/idb-folder.ts`: one kept in IndexedDB (Safari's vaults, the iPad's own data).
- `src/mounts.ts`: the host's `HostFiles` over the mounted folders, and their watchers.
- `src/platform.ts`: the `HostPlatform`: files, the store in the data folder, workers, SHA-256.
- `src/pages.ts`: a note's page (a blob: document, or the embedder's), and its channel.
- `src/workers.ts`: web workers from the built `*.web.js` scripts.
- `src/sha256.ts`: SHA-256 without waiting, checked against node:crypto.

## Contracts

`HostPlatform` (host-node's `platform.ts`), `VaultFileSystem` (here), the page
channel (host-node's `embedding.ts`), and the `WindowBackend` the app's local
backend gives the window (`packages/app/src/shell/backend.ts`).

## Limits

- A folder handle reports no changes made from outside; they show on the
  next listing.
- Files a note shows (images, videos, PDFs) need their URLs (`resource`)
  answered by the embedder: the web app's service worker, the iPad's router.
- No Git, no extra panels: their settings are not offered.
