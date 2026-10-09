# Page preview

Preview an internal link with modifier-hover or Alt+Enter, like Obsidian's Page
preview. Open the target from the popup or dismiss it with Escape or Close.

## How it works

Editor-owned hover, keyboard and focus listeners select a target. The controller
opens a positioned popup, resolves the target through resources, and renders a
note fragment or attachment through the shared pipeline. Each load carries a
generation; closing or replacing the popup invalidates late results and disposes
their render passes. Preview task controls cannot edit the source.

## Files

- `manifest.ts`: feature identity and default enablement.
- `webview.ts`: editor extension and view-plugin lifetime registrations.
- `controller.ts`: target selection, timers, loading generations and focus lifetime.
- `popup.ts`: popup controls, label decoding and viewport placement.
- `content.ts`: note fragment context and attachment rendering.
- `preview.test.ts`: internal-target policy, fragment context and label unit tests.
- `pagePreview.css`: the plugin's styles, bundled through `src/webview/styles/index.css`.

## Services, events and settings

Injects `editor`, `resources`, `render` and `rpc`; provides no service. Opens
through the validated `links.open` RPC. Document changes close the popup.
No kernel events are registered. The feature switch is
`markdownWorkbench.plugins.pagePreview.enabled`; there is no separate config.

## Limits and differences from Obsidian

External schemes are not fetched. Previews use this extension's renderers and
VS Code theme. Attachments unsupported by the renderer show an Open prompt.
All timers, listeners, popup DOM and render passes stop with the view/plugin.
