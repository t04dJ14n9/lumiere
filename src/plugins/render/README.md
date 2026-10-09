# Rendered Content

Renders Markdown blocks and embedded content for Live Preview, corresponding to
Obsidian's Markdown renderer and post-processors.

## How it works

Each render creates a pass, runs preprocessing, renders and sanitizes Markdown,
constrains remote content according to workspace trust, offers fences to plugins,
then runs post-processing and requests measurement. Abort checks before DOM writes
and after fence dispatch preserve cancellation. Passes own reverse-order cleanup;
plugin disposal disposes all remaining passes.

## Files

- `manifest.ts`: core plugin metadata.
- `api.ts`: render service, pass, fence and event contracts.
- `webview.ts`: service assembly and ordered render pipeline.
- `pass.ts`: pass identity, source context and disposal lifecycle.
- `security.ts`: trusted iframe and untrusted remote-source restrictions.
- `sanitizer-options.ts`: DOMPurify options; links keep application schemes for the host's link policy.
- `sanitizer-options.test.ts`: sanitizer option units.
- `pass.test.ts`: cleanup ordering, late registration and reentrant disposal units.

## Services, events and settings

Injects `markdown` and `editor`; provides `render`. Dispatches `render/preProcess` and
`render/postProcess` serially, and `render/fence` with bail semantics. No commands
or independent user settings. Render calls read `editor.strictLineBreaks`;
host-provided workspace trust controls remote content.

## Limits and differences from Obsidian

Rendering uses VS Code colors and host trust rules. All HTML is sanitized; scripts,
forms, objects, embeds and srcdoc are forbidden. External rendering integrations
use the public extension points; exact visual parity awaits owner comparison.
