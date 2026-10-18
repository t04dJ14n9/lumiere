# Sticky scroll

Pins the current section's ancestor Markdown headings above the editor while
scrolling, like VS Code's sticky scroll. Obsidian has no built-in equivalent.
Click a pinned heading to return to it. Works in Live Preview and Source mode.

## How it works

A document state field indexes top-level ATX and Setext headings with the shared
Markdown parser and heading labels. A view plugin measures the first visible
block and draws its scrolled-away ancestors in an overlay, without changing the
document's height. CodeMirror scroll margins keep navigation targets below the
overlay. Each panel owns its own chrome; removing the editor extension removes
the field, overlay, scroll listener and margins.

## Files

- `manifest.ts`: opt-in enablement and maximum row setting.
- `model.ts`: section index, ancestor selection and document state field.
- `view.ts`: measured overlay, heading buttons and scroll margins.
- `webview.ts`: owned registration, configuration updates and jump history.
- `stickyScroll.css`: VS Code theme colors, compact rows and focus styling.
- `model.test.ts`: section, syntax, editing and ancestor selection tests.
- `view.test.ts`: measured overlay, navigation and disposal tests.
- `test/unit/stickyScroll/webview.test.ts`: settings, panel isolation and lifecycle tests.

## Services, events and settings

Injects `editor`; provides no services and listens to/emits no kernel events.
Uses the editor's extension registration and navigation history.

- `lumiere.markdown.plugins.stickyScroll.enabled`: **false** by default.
- `lumiere.markdown.stickyScroll.maxLines`: **5**, range 1–6, rounded down.

Settings apply immediately, per resource, through the existing plugin settings
flow. The `minimal` preset does not load feature plugins.

## Limits and differences from Obsidian

Only document-level headings define sticky sections; lists, blockquotes,
frontmatter keys and fenced code do not add rows. Labels are plain text,
truncated to one compact row. A heading pins after its whole block has scrolled
past the viewport top; section changes replace rows without a push animation.
When the limit is exceeded, the nearest ancestors remain. The overlay uses at
most one third of the editor's height and can show fewer rows in small panes.
