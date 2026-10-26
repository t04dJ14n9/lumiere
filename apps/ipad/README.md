# Lumière for iPad

Lumière on the iPad, with no server: the desktop app's window and Lumière's
plugins (host-web) in a Capacitor app, over the iPad's own files. Its plan is
`docs/IPAD_PLAN.md`.

```bash
pnpm --filter @workshop/ipad sync    # builds dist/web and copies it into ios/
cd apps/ipad/ios/App && xcodebuild -project App.xcodeproj -scheme App \
  -destination 'generic/platform=iOS Simulator' build
```

Vaults are the app's own folder ("Lumière" in Files, on the iPad or in
iCloud Drive) and folders picked in Files, kept between launches. The native
plugin reads and writes them with `NSFileCoordinator`, so Files, other apps
and iCloud see each change whole. The host's own data is kept in IndexedDB.

## A sample vault

`scripts/sample-vault.mjs` writes a disposable vault for trying the app:
linked projects, research, people and daily notes, the editor's feature
notes (under Features/) and PDFs. Put it in the app's folder in the
simulator, or on an iPad over USB:

```bash
node apps/ipad/scripts/sample-vault.mjs /tmp/sample-vault
cp -R /tmp/sample-vault/. "$(xcrun simctl get_app_container booted io.github.t04dj14n9.lumiere data)/Documents/"
xcrun devicectl device copy to --device <udid> --domain-type appDataContainer \
  --domain-identifier io.github.t04dj14n9.lumiere --source /tmp/sample-vault --destination Documents
```

## Files

- `src/main.ts`: mounts the vaults and starts host-web and the window.
- `src/native-fs.ts`: a vault as host-web's `VaultFileSystem`, over the plugin.
- `src/native/vault-files.ts`: the `LumiereVaultFiles` plugin, as JavaScript calls it.
- `src/native/window-commands.ts`: the menu bar's, keys' and edit menu's commands, for the window,
  and Insert Sketch from the edit menu.
- `src/native/ink.ts`: the `LumiereInk` plugin (PencilKit) as the `ink` host service.
- `src/welcome.ts`: the note the app's folder starts with.
- `index.html`: the page and its content security policy.
- `scripts/build.mjs`: the build (host-web's `buildBrowserApp`).
- `ios/LumiereNative`: the native plugins (vault files, the window's commands,
  the keyboard inset, the PencilKit canvas in `Ink/`), a Swift package with
  its own tests:
  `xcodebuild test -scheme LumiereNative -destination 'platform=iOS Simulator,name=iPad Air 11-inch (M4)'`.
- `ios/App`: the Xcode project.

## Limits

See `docs/IPAD_PLAN.md`, section 6. Sketches (P1) draw on PencilKit; how the
Pencil feels against Notes is checked on a real iPad, not in the simulator.
iCloud vaults (C1) and TestFlight (R1) wait on the Apple Developer Program.
