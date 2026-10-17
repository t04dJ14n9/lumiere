# Resources

Loads local notes, images, audio, video and attachment cards used by embeds and
previews, corresponding to Obsidian's vault resource access.

## How it works

Each panel owns a set of known note sources and a validated resource RPC channel.
Targets resolve through the injected vault index; URI and realpath containment
are checked before reads. Notes use open-document text when available, preserving
unsaved edits. Successfully loaded notes become authorized sources for nested
requests. Webview URLs include modification time for cache invalidation.

## Files

- `manifest.ts`: core plugin metadata and surfaces.
- `api.ts`: resource kind and service contracts.
- `protocol.ts`: load request/result schemas.
- `host.ts`: service and RPC registration.
- `diff-resources.ts`: independent diff-side resolution and Git revision selection.
- `note-resources.ts`: known-source authorization, target containment, contained reads and kind selection.
- `containment.ts`: URI/realpath and virtual-symlink checks.
- `webview.ts`: validated resource RPC client.
- `note-resources.test.ts`: kind precedence and fallback units.

## Services, events and settings

Host injects `rpc`, `workbench` and `vault`; webview injects `rpc`. Provides
`resources` on both surfaces. No kernel events, commands or direct user settings.
Vault configuration determines roots and resolution. The window service
`diffResources` injects `vaults` and `workbench` and provides contained image
resolution for standalone diff panels.

## Limits and differences from Obsidian

Only contained vault links are loadable; external URLs and unknown source notes
are rejected. Virtual filesystem symlinks are refused. Notes use the `.md`
extension for resource classification. Host authorization is rechecked before
embedded edits by consuming plugins.
