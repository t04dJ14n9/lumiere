# Lumière on the iPad: local vaults, sync and Apple Pencil

Status: plan, version 2, 2026-10-22. Nothing here is built. It follows
[HOSTS_PLAN.md](HOSTS_PLAN.md), which describes the layers this builds on.

## 1. Decided

The owner's decisions, 2026-10-22:

1. **Local mode first.** The iPad keeps its own copy of the vault and works
   offline. A remote vault (the iPad as a window onto the Mac) comes later.
2. **Sync by iCloud, or by direct access over Tailscale.** Git with LFS and
   other WebDAV servers come later.
3. **Apple Pencil, as good as Notes.**
   - Sketches in Markdown notes.
   - Annotations on PDFs.
   - The handwriting should feel like the built-in Notes app. Lumière's
     own touches come afterwards.
   - Strokes are pressure-aware, so writing feels like pen on paper; the
     pressure survives into the file and onto every screen (section 5.2).
4. **Everything is a plugin.** Pencil, sync and the iPad's native abilities
   included.

## 2. The shape of it

The iPad can't run Node, and today Lumière's plugins run in a Node process
(VS Code's extension host, or host-node for DSH and the desktop app). Local
mode therefore needs a host that runs in the web view itself, **host-web**.

Native abilities never reach the plugins directly. Native code on the iPad
offers **host services**, just as VS Code's API is wrapped in host services
today:
- files;
- iCloud;
- the PencilKit canvas;
- the PDF surface.

Plugins inject the services they need. A platform that lacks one does not
provide it, and the plugins needing it simply don't start (Cordis starts a
plugin only when its services exist).

```text
packages/core, markdown, pdf      the plugins, the same everywhere
  ├─ packages/host-node           Node host: desktop app, DSH, home server
  └─ packages/host-web (new)      the same host without Node: the iPad
packages/sync (new)               the sync engine and its providers, as plugins
packages/ink (new)                Pencil and ink: the format, the web canvas, the plugins
packages/app                      the window (files, tabs, outline, Settings)
  ├─ apps/desktop                 Tauri
  └─ apps/ipad (new)              Capacitor 8: the window and host-web, plus native
                                  plugins that provide host services: files, iCloud,
                                  PencilKit, the PDF surface, the Keychain
```

The rules:

- **The window doesn't know where its host is.** Its server calls
  (`api.ts`, `views.ts`, `settings.ts`, `ui-state.ts`) become one
  `WindowBackend` interface:
  - HTTP to a Lumière server on the desktop and the web;
  - in-process to host-web on the iPad.
- **The editor page doesn't either.** The page shim's WebSocket becomes a
  transport: a socket to a server, or a `MessageChannel` to host-web in the
  same app. `protocol.ts` is unchanged.
- **host-node and host-web share one core.** The following are written once:
  - documents, panels, tree views, the right-click menu;
  - settings and navigation.

  Only the Node-specific parts differ (files, workers, hashing, real paths).
  The `claude/web-extension` branch already designed and built this split
  for VS Code's web extension host (`WorkerLauncher`, `Digests`,
  `RealPaths`, `AgentFiles`; `docs/WEB_BUILD.md` there). It is ported onto
  `main`, not merged, since it is 213 commits on an old base.
- **Swift knows nothing about Markdown or PDFs' meaning.** A native plugin
  offers a capability: give me a drawing, show this PDF page with a canvas.
  What it is for is a TypeScript plugin's business. Lumière's own
  modifications later are TypeScript plugins on the same services.

## 3. Local mode on the iPad

- **Where a vault lives.** Three places:
  - the app's own folder, which shows as "Lumière" in the Files app;
  - Lumière's iCloud container (section 4.1);
  - any folder picked in Files: iCloud Drive, a USB drive, another app's
    storage, kept with a security-scoped bookmark.
- **How it runs.** host-web runs in the app's web view. The vault index and
  search run in Web Workers. Files go through a `VaultFileSystem` service,
  implemented by a native Capacitor plugin (coordinated reads and writes,
  bookmarks, change notices).
- **What works from day one.** The window is the desktop app's:
  - files, tabs and the outline;
  - Settings and the right-click menu;
  - VS Code's keys on a hardware keyboard. Keys the system takes first
    become `UIKeyCommand`s that send the same window commands as the
    desktop app's menu.
- **Touch.** Running in WebKit on a touch screen needs:
  - long-press for the right-click menu;
  - touch-sized targets, and no hover-only controls;
  - safe areas;
  - the on-screen keyboard resizing the editor;
  - Split View and Stage Manager widths;
  - the sidebar and outline as overlays when narrow.

## 4. Sync

### 4.1 iCloud

iCloud keeps the files in step itself, so Lumière's sync engine is not
involved.

- **iPad.** The vault lives in Lumière's iCloud container. A Swift plugin:
  - reads and writes through `NSFileCoordinator`;
  - downloads files that exist only in the cloud before opening them;
  - follows changes from other devices with `NSMetadataQuery`, so an open
    note updates as it does when a file changes on the desktop;
  - reports iCloud's conflict versions. Lumière shows them as
    `Note (conflict, Mac, 2026-10-22 14.03).md` beside the note, the same
    as the engine's conflicts (4.2), and never drops one.
- **Mac.** The desktop app opens the same container folder, and macOS
  syncs it. Files that are only in the cloud download when read. The
  desktop's vault picker offers the container when it exists.
- **Needs** a paid Apple Developer membership: iCloud containers are not
  available to free accounts (section 9).

### 4.2 Direct access over Tailscale

For a vault that isn't in iCloud (on the Mac or the home server), the iPad
syncs straight with the Lumière that has it, whenever both are on the
tailnet.

- **The other side** is Lumière's own server (the desktop app or
  `lumiere-server` on the home server) with remote access on:
  - **pairing:** a QR code in Settings > Remote Access; the iPad keeps a
    long-lived device token in the Keychain, and devices can be revoked;
  - **a fixed port**, behind `tailscale serve`, which gives the machine an
    HTTPS name on the tailnet while the server keeps listening on the
    loopback;
  - the vault served over **WebDAV**, so other WebDAV clients and servers
    fit the same provider later.

  Nothing is exposed beyond the tailnet. The Tailscale app on the iPad
  provides the network; Lumière embeds no VPN.
- **The sync engine** (`packages/sync`) is shared by every provider except
  iCloud.
  - **State.** It keeps each file's hash and its base (the version both
    sides last agreed on) in `.lumiere/sync/`, outside the vault index.
  - **A sync, in four steps:**
    1. list both sides;
    2. classify each file: unchanged, changed here, changed there, changed
       on both, added, deleted, renamed;
    3. apply;
    4. save the new bases.
  - **Both sides changed a note:** a three-way merge against the base. If
    lines conflict, both versions are kept as conflict copies.
  - **Binary files changed on both sides** (sketches, PDFs with new
    annotations): both are kept.
  - **Deletions** go to `.trash/`, as in Obsidian. Nothing is overwritten
    or deleted without a base.
  - **When it runs:** on opening, after saves (debounced), on a timer while
    the other side is reachable, and by Sync Now.
  - **What you see:** a status (synced, syncing, other side unreachable,
    n conflicts) and a log.
- **Providers** are plugins on the engine:
  - first, `syncPeer`: another Lumière, over WebDAV;
  - later, `syncWebdav` for any WebDAV server, and `syncGit` (Git with LFS:
    the `git` CLI on the desktop, isomorphic-git plus Lumière's own LFS
    client on the iPad, since the JavaScript Git library has no LFS).

## 5. Apple Pencil

### 5.1 The goal

Writing with the Pencil should feel like Notes because it is the same
engine: **PencilKit**. That gives Lumière, for free:
- pressure and tilt;
- palm rejection and Apple's low latency;
- the tool picker (pen, pencil, marker, eraser, lasso, ruler, colours);
- undo;
- double-tap and squeeze on the Pencil.

A drawing in a web view can't match that. So on the iPad, drawing happens
on a native PencilKit canvas, and everything around it (where drawings
live, how they show in notes, what a tap does) is Lumière's plugins.

"Good" is measured against Notes on the same iPad, side by side:
- no visible gap between the Pencil's tip and the ink;
- a palm resting on the screen never draws;
- pressure and tilt change width and shading as they do in Notes;
- every Notes tool is there:
  - pen, fountain pen, pencil, marker and monoline;
  - pixel and object erasers;
  - lasso, ruler and colours;
- double-tap and squeeze switch tools as set in Settings > Apple Pencil;
- undo and redo work with three-finger swipes and ⌘Z;
- a finger scrolls while the Pencil draws, with an option to draw with a
  finger;
- hover shows where the tip will land (Pencil 2 and Pencil Pro on M2 and
  later iPads).

### 5.2 Pressure, as on paper

Every stroke is pressure-aware, from the Pencil into the file and back onto
any screen.

- **Drawing on the iPad.** PencilKit's inks respond to how hard and at what
  angle the Pencil is held, as a real nib or lead does:
  - the pen and fountain pen thicken with pressure; the fountain pen also
    follows the nib's angle, and the barrel roll on Pencil Pro;
  - the pencil shades darker as you press, and broader as you tilt it, as
    graphite does;
  - the marker lays down more ink the harder you press.
- **Kept in the file.** Each point stores the Pencil's raw input (force,
  altitude, azimuth, time) and the width the ink drew at that point
  (section 5.4). Nothing about the pressure is lost.
- **Shown anywhere as drawn.** The SVG draws each stroke as a filled
  outline whose width follows the stored widths, not as a line of one
  width. A sketch looks the same in Obsidian, on GitHub or in VS Code as on
  the iPad, and pencil strokes keep their shading as varying opacity.
- **Drawing elsewhere.** The web canvas reads pressure and tilt from the
  browser (Pointer Events), so a pen tablet on the desktop draws with
  pressure. With a mouse or trackpad it thins the line with speed
  (`perfect-freehand`), like a pen dragged quickly.
- **Paper.** A sketch can have a page behind it, drawn in the SVG: plain,
  ruled, grid or dotted, as in Notes.
- **If PencilKit's response isn't enough.** PencilKit's pressure curves are
  fixed. Lumière's own modifications may want more:
  - a pressure curve of your own;
  - a nib that splays like a real fountain pen;
  - paper grain.

  Those would be another `ink` provider: a Metal renderer working from the
  Pencil's raw input. Because files keep the raw force, a drawing made with
  either engine shows and edits in the other.

### 5.3 Services and plugins

| Piece | What it does | Provided by |
| --- | --- | --- |
| `ink` host service | Opens a canvas on an existing drawing (or a blank one) and returns the drawing when done; says what the device has (pressure, Pencil, tool picker). | iPad: `LumiereInk`, a Swift Capacitor plugin on PencilKit. Desktop and web: `webInk`, a Pointer Events canvas (pressure from pen tablets, `perfect-freehand`, MIT). VS Code: none at first. |
| `sketch` plugin (Markdown) | Insert Sketch, also from a Pencil tap in the margin; shows sketches in notes; tap one to edit it. | `packages/ink` |
| `pdfSurface` host service | Shows a PDF with a PencilKit canvas on each page (PDFKit's page overlays, iPadOS 16+: the same markup as Files and Notes) and saves the ink. | iPad: `LumierePdf`, a Swift Capacitor plugin. Elsewhere: none (Lumière PDF's own viewer). |
| `pdfInk` plugin (PDF) | Opens a PDF for markup on the iPad. Saves ink as standard PDF ink annotations. On the desktop, Lumière PDF shows them; editing them there comes with EmbedPDF's annotation plugin (MIT, the same 2.15 line Lumière PDF uses). | `packages/ink` and `packages/pdf` |

Lumière's later modifications are more plugins on the same `ink` service:
- shape snapping;
- handwriting turned into text;
- links into a sketch region, for Copy Link for Agent.

### 5.4 The sketch file

A sketch is one file that shows everywhere and edits in Lumière:
`Sketches/2026-10-22 14.03.sketch.svg`, embedded as
`![[2026-10-22 14.03.sketch.svg]]`.

- **The SVG** draws the strokes. Obsidian, GitHub, VS Code and any browser
  show it as an image.
- **Inside it, in `<metadata>`:**
  - the portable strokes, as JSON. Each stroke has its tool and colour, and
    its points, which map one to one onto PencilKit's `PKStrokePoint`. Each
    point has:
    - position and time;
    - force, altitude and azimuth;
    - the width and opacity the ink drew there;
  - PencilKit's own drawing data, so the iPad re-opens it exactly as drawn.
    An edit made elsewhere drops this, and the iPad rebuilds it from the
    strokes.
- **The folder** follows Obsidian's attachment setting
  (`attachmentFolderPath`), so vaults shared with Obsidian keep their
  layout.

### 5.5 Editing in place

- **First version:** tapping a sketch (or Insert Sketch) opens the canvas
  over the note, sized to the sketch, with the tool picker. Done saves it,
  and the note shows the new SVG.
- **Later:** the native canvas sits exactly over the sketch in the note and
  follows scrolling, as in Notes. That needs the web view and the canvas
  kept in step on every scroll and resize. It is a refinement, not a start.

## 6. Milestones

Each one is a PR with its own tests; `pnpm check` passes before every push.

| # | What | Size | Needs | Device |
| --- | --- | --- | --- | --- |
| H1 | host-web: port the platform split; the page and window transports; host-node and host-web share their core; Lumière running in a plain browser from an in-memory vault | L | — | none |
| L1 | iPad app, local mode: the Capacitor project, host-web inside, `VaultFileSystem` (the app folder, folders picked from Files), the window's touch work, keyboard commands | M | H1 | simulator |
| C1 | iCloud vaults: the container plugin (coordinated files, downloads, changes, conflict versions); the desktop opening the same folder | M | L1, decision 1 | iPad |
| T1 | Direct access over Tailscale: pairing, device tokens and WebDAV in Lumière's server; the sync engine; the `syncPeer` provider; sync status | L | L1 | simulator, then iPad |
| P1 | Sketches: the `ink` service (PencilKit on the iPad, the pressure-aware web canvas elsewhere); the `sketch` plugin; the sketch file, with variable-width outlines from the stored pressure | L | L1 | iPad and Pencil |
| P2 | PDF markup: the `pdfSurface` service; the `pdfInk` plugin; ink annotations shown in Lumière PDF on the desktop | L | P1, decision 3 | iPad and Pencil |
| R1 | TestFlight; then the App Store | M | decision 1 | iPad |
| Later | Remote mode; the installable web app; `syncWebdav`; `syncGit` with LFS; editing sketches in place (5.4); editing PDF ink on the desktop | | | |

Order: H1 → L1 → C1 and T1 (either first; C1 needs decision 1) → P1 → P2 → R1.

**Where it stands.** H1 is done, with the web app on top (`apps/web`):

- the shared host runs on a `HostPlatform` (Node's, or host-web's), from
  `@workshop/host-node/core`, which reaches no Node built-in;
- host-web mounts `VaultFileSystem`s at `/vaults/<name>` and its data at
  `/lumiere-data`; an editor page is a blob: document that talks to its
  panel over a `MessageChannel` the window hands it;
- the window talks to its host through `WindowBackend`: HTTP to a server,
  or `@workshop/app/local` (host-web in the same page);
- in the browser, Lumière opens folders the reader picks (Chromium), or keeps
  vaults in the browser (its private storage where a page can write it, else
  IndexedDB, as in Safari), and works offline.

L1 runs, for reading and writing notes: the iPad app gives host-web its
vaults as `VaultFileSystem`s over the native `LumiereVaultFiles` plugin (the
app's folder, and folders picked in Files) and starts the window with
`startLocalHost`, as `apps/web/src/main.ts` does. Checked in the simulator:
a note opens in Live Preview with its outline, and what is typed is written
to its file. The touch work in section 3 is in:

- the window keeps clear of the status bar, the home indicator and the
  on-screen keyboard (safe areas);
- below 1200 px wide (an iPad in portrait, Split View, a small window) the
  note takes the whole width, and the files or the outline float over it,
  one at a time, only as tall as their content (`panels.ts`); buttons and
  rows grow on a touchscreen;
- opening a note, or a heading from the outline, leaves the on-screen
  keyboard down until the note is tapped;
- the edit menu (Cut, Copy, Paste) has More…, which opens Lumière's
  right-click menu at the selection, since a long-press belongs to the
  cursor; the menu bar's and keys' commands reach the window
  (`appCommands` on the window's backend).

Not done yet:

- on the real iPad: whether the first tap after launch still seems only to
  wake the page (in the simulator it opens the note, after a moment);
  whether the edit menu shows after a long-press (in the simulator it shows
  on a tap on the selection); Split View widths;
- images in notes (their `lumiere/file` URLs need an answer: the web app's
  service worker, or the iPad's scheme handler), and PDFs in tabs.

Who does what:
- **Claude:** the architecture, host-web, the engine, the TypeScript
  plugins and the Swift plugins.
- **Grok Bot:**
  - Xcode, signing and TestFlight;
  - the pass on the real iPad;
  - judging how the Pencil feels against Notes.

## 7. Testing

- **Unit tests** for everything with logic:
  - host-web against the same tests as host-node;
  - the engine (every classification and conflict case, against fake
    providers), and the three-way merge;
  - the sketch format's round trip, and stroke ↔ SVG;
  - outlines that follow the stored widths: a stroke pressed harder in the
    middle is wider there, in the SVG as on the canvas;
  - pairing and tokens;
  - the transports.
- **Integration tests** on the loopback:
  - the engine against a real WebDAV endpoint (Lumière's own server);
  - host-web in Chromium and WebKit (Playwright), from an in-memory vault.
- **The iPad simulator** (iPad Pro, Air and mini, with Xcode 27.1 on this
  Mac). Claude can build, launch, tap, type and screenshot it from this
  session, which covers H1, L1 and most of T1. Because the simulator uses
  the Mac's network, the tailnet is reachable from it.
- **A real iPad** for:
  - iCloud (C1);
  - the Tailscale app (end of T1);
  - everything Pencil (P1, P2): the simulator has no pressure, tilt or
    palm rejection. Grok Bot runs the section 5.1 checks there, against
    Notes, side by side;
  - performance on a large vault;
  - TestFlight.

## 8. Risks

1. **WebKit and touch.** Lumière was built in Chromium. The desktop app has
   already shown differences (not painting while covered); expect more on
   touch.
2. **A native canvas next to a web view.** The first version opens the
   canvas over the note (5.4) to avoid tracking the page's scrolling.
3. **Two PDF engines.** PDFKit on the iPad, PDFium elsewhere. Annotations
   cross only because they are standard PDF ink annotations; Lumière keeps
   nothing outside the PDF that the other side needs.
4. **Large vaults on the iPad.** The index runs in a Web Worker within iOS
   memory limits, and may need a lighter first pass.
5. **Merges.** The engine never overwrites or deletes without a base and
   keeps conflict copies. Its tests come before its first provider.
6. **App Store review.** User-configured servers and a web view running
   Lumière's own bundled code are ordinary. Nothing is downloaded and run.

## 9. Still to decide

1. **Apple Developer Program** ($99 a year), on whose account.
   - Needed for iCloud (C1) and TestFlight (R1).
   - Without it, a build on the iPad lasts 7 days.
   - Enrolment can take a day or two, so starting it now keeps C1 off the
     critical path.
2. **When to connect the iPad.** Not for H1 or L1, which run in the
   simulator. From C1 (iCloud) or P1 (Pencil), whichever comes first: by
   cable or Wi-Fi to Xcode on this Mac, with the developer mode switch on.
3. **PDF annotations: into the PDF, or beside it.** Recommended: into the
   PDF, as standard ink annotations, as Files and Notes do. Every reader
   then shows them, at the cost of the PDF changing (and syncing) when
   marked up. The alternative is a sidecar file that only Lumière reads.
4. **Where sketches go:** Obsidian's attachment folder (recommended), or a
   fixed `Sketches/` folder.
