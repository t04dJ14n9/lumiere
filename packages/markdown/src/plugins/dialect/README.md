# Markdown Dialect

Provides one fixed Obsidian-flavored Markdown grammar, metadata model and HTML
renderer to the host and editor, corresponding to Obsidian's Markdown parser.

## How it works

Both plugin surfaces load the same definition and publish a Markdown service.
The service delegates to the pure dialect, cached metadata and renderer factory;
feature plugins customize presentation through rendering hooks, not the grammar.
Each plugin instance gets its own renderer configuration.

## Files

- `manifest.ts`: core metadata and host/webview surface declaration.
- `api.ts`: Markdown service contract.
- `definition.ts`: shared service construction.
- `host.ts`: host entry point for the shared definition.
- `webview.ts`: webview entry point for the shared definition.

## Services, events and settings

Injects no services; provides `markdown`. No kernel events, commands or direct
user settings. Consumers use parser/language, metadata and renderer operations.

## Limits and differences from Obsidian

Grammar is fixed; feature plugins cannot change parsing. HTML sanitization and
DOM enhancement belong to Render and feature plugins. It uses independently
implemented/open-source parsing and never Obsidian code or assets.
