# Obsidian Compatibility & Native `obsidian` API

Provides vault configuration compatibility (`app.json` and `types.json`), a native
`obsidian` CommonJS/ESM API surface in the webview, and a `.obsidian/plugins/`
community plugin loader (trusted workspaces only) as a first-class Cordis plugin.

## How it works

1. **Vault Configuration (`host.ts`)**:
   Core `vault` discovers the root using `vault.rootMarkers`. Compatibility separately
   selects `.obsidian` (or `obsidianCompat.configFolder`) under that root, and the host
   checks containment and symlinks before reading. Explicit VS Code values at any
   applicable layer win over Obsidian candidates, which win over package defaults.
2. **Community Plugin Loader (`community-plugins.ts` & `panel-host.ts`)**:
   In **trusted** workspaces (`host.workspace.isTrusted() === true`), `CommunityPluginLoader`
   reads `<configDir>/community-plugins.json` (enabled plugin IDs) and loads each enabled
   plugin's `manifest.json`, `main.js`, optional `styles.css`, and optional `data.json`
   with strict path containment and symlink checks. Untrusted workspaces never read or
   execute `.obsidian/plugins/*/main.js` and reject `loadData`/`saveData`.
3. **Native `obsidian` Module & Webview Runtime (`webview.ts`, `runtime.ts`, `obsidian-*.ts`)**:
   Exposes the `obsidian` API (`Component`, `Plugin`, `App`, `Vault`, `TFile`, `TFolder`,
   `MetadataCache`, `FileManager`, `Editor`, `Workspace`, `MarkdownView`, `MarkdownRenderer`,
   DOM prototype helpers, `Setting`, `PluginSettingTab`, `Notice`, `Modal`, `Menu`,
   `Platform`, `debounce`, `normalizePath`, `parseYaml`, `stringifyYaml`, etc.) and
   CommonJS `require("obsidian")` / `@codemirror/*` / `@lezer/*` resolution.
   Unloading a plugin automatically disposes its child components, callbacks, DOM listeners,
   intervals, commands, codeblock processors, post-processors, CM6 extensions, and styles.

## Files

- `manifest.ts`: feature switch (`surfaces: ["host", "webview"]`) and `configFolder` setting.
- `api.ts`: vault/document-scoped registry API, community plugin bundle types, and change event.
- `protocol.ts`: typed host/webview RPC protocol (`bootstrap`, `loadPluginData`, `savePluginData`, vault operations).
- `host.ts`: host service publication, settings provider registration, and lifecycle effects.
- `panel-host.ts`: panel-scoped RPC bridge for community plugins and vault operations.
- `community-plugins.ts`: trusted-workspace `.obsidian/plugins/*` discovery and `data.json` persistence.
- `webview.ts`: webview Cordis plugin wiring `ObsidianRuntime` to `editor`, `render`, `livePreview`, `commands`, and `rpc`.
- `runtime.ts`: `ObsidianRuntime` and CommonJS `main.js` evaluator.
- `obsidian-module.ts`: `obsidian` module export table and `require("obsidian")` resolver.
- `obsidian-core.ts`: `Events`, `Scope`, `Keymap`, `Component`, `MarkdownRenderChild`, `Platform`, YAML/path utilities.
- `obsidian-files.ts`: `TAbstractFile`, `TFile`, `TFolder`, `DataAdapter`, and `Vault`.
- `obsidian-metadata.ts`: `MetadataCache` (backed by Lumière's `metadata()` parser) and `FileManager`.
- `editor-bridge.ts`: `Editor` wrapper over CodeMirror 6 `EditorView` and CM6 state fields.
- `obsidian-workspace.ts`: `Workspace`, `WorkspaceLeaf`, `MarkdownView`, `MarkdownRenderer`, and `App`.
- `obsidian-ui.ts` & `obsidian-modals.ts`: `Setting`, `PluginSettingTab`, `Notice`, `Modal`, `Menu`, `SuggestModal`, and icon/tooltip utilities.
- `obsidian-plugin.ts`: `Plugin` base class.
- `dom-helpers.ts`: idempotent Obsidian DOM helper installation on `HTMLElement` / `DocumentFragment`.
