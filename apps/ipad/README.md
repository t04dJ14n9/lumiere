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

## Files

- `src/main.ts`: mounts the vaults and starts host-web and the window.
- `src/native-fs.ts`: a vault as host-web's `VaultFileSystem`, over the plugin.
- `src/native/vault-files.ts`: the `LumiereVaultFiles` plugin, as JavaScript calls it.
- `src/welcome.ts`: the note the app's folder starts with.
- `index.html`: the page and its content security policy.
- `scripts/build.mjs`: the build (host-web's `buildBrowserApp`).
- `ios/LumiereNative`: the native plugins (vault files, the window's commands,
  the keyboard inset), a Swift package with its own tests:
  `xcodebuild test -scheme LumiereNative -destination 'platform=iOS Simulator,name=iPad Air 11-inch (M4)'`.
- `ios/App`: the Xcode project.

## Limits

See `docs/IPAD_PLAN.md`, section 6: the touch work, images and PDFs, and the
native menu's commands are next; iCloud vaults (C1) and TestFlight (R1) wait
on the Apple Developer Program.
