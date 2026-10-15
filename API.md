# Markdown Workshop API, version 1

Other VS Code extensions use this API to inspect notes open in Markdown
Workshop, to read the vault index, and to add **external plugins**: host-side
plugins that put badges (markers) on note text, claim links, render fenced
code blocks, add actions and register commands. It plays the role of
Obsidian's plugin API, with one difference: no outside code runs inside the
editor's webview. Everything an external plugin contributes is data that the
editor validates and sanitizes.

The declarations ship in `dist/api/` (`types.d.ts`, `plugin-types.d.ts`,
`metadata-types.d.ts`), generated from `src/host/api/` by `pnpm build`.
They import only `vscode` and each other, so you can copy them into your
extension. Version 1 is frozen: later versions add members, and never change
or remove these.

Contents: [Getting the API](#getting-the-api) ·
[Coordinates](#coordinates) · [Editors](#editors-and-documents) ·
[Selections](#selections-and-agent-references) · [Vault](#vault) ·
[Plugins](#plugins-and-settings) · [Events](#events) ·
[External plugins](#external-plugins) · [Markers](#markers) ·
[Actions](#actions) · [Code blocks](#code-block-processors) ·
[Errors](#errors) · [Complete example](#complete-example) · [AGENT.md](AGENT.md)

## Getting the API

Depend on the extension, then activate it:

```jsonc
// package.json
"extensionDependencies": ["t04dj14n9.vscode-markdown-workshop"],
"activationEvents": ["onLanguage:markdown", "onCustomEditor:markdownWorkshop.editor"]
```

```ts
import * as vscode from "vscode";
import type { MarkdownWorkshopApi } from "./markdown-workshop/types";

const api = await vscode.extensions
  .getExtension<MarkdownWorkshopApi>("t04dj14n9.vscode-markdown-workshop")
  ?.activate();
if (api?.apiVersion !== 1) {
  return; // Not installed, or an API version this code does not know.
}
```

The returned object and everything it returns are frozen.

## Coordinates

- **Source offsets** are UTF-16 code unit offsets into the text VS Code holds
  for the note, **counting CR characters** in CRLF files: the same offsets as
  `TextDocument.offsetAt`. They always refer to one document version.
- **Lines** are 1-based in the API (`SourceTarget`, `SelectionSnapshot`).
- **Metadata** (`getMetadata`) uses the vault index's coordinates: offsets in
  LF-normalized text and 0-based lines and columns, as Obsidian's
  `CachedMetadata` does.

A `SourceTarget` is `{ from, to }` (source offsets), `{ line }` (1-based),
`{ startLine, endLine }` (1-based, inclusive) or `{ fragment }` (a heading,
or a block as `^block-id`). A line range selects from the beginning of the
first line through the end of the last line, excluding its line ending.
Readiness and pending edits are awaited before line ranges are resolved.

## Editors and documents

Each Markdown Workshop editor panel has an `EditorId`. One note open twice
has two editors with two IDs and the same `documentId`.

| Member | Behaviour |
| --- | --- |
| `getEditors()` | Snapshots of every open editor: `editorId`, `documentId`, `uri`, `version`, `isDirty`, `isUntitled`, `viewColumn`, `isActive`. |
| `getActiveEditor()` | The editor in the active tab, or `undefined` (also when the active tab is another editor). |
| `open(uri, options?)` | Opens the note in Markdown Workshop (`viewColumn`, `preserveFocus`) and resolves with its snapshot once the editor is ready. `reveal` scrolls to a `SourceTarget` and selects it. |
| `reveal(editorId, target, { focus? })` | Scrolls an open editor to the target and selects it. `InvalidArgument` for a target outside the note. |

## Selections and agent references

| Member | Behaviour |
| --- | --- |
| `getSelection(editorId, { token? })` | Waits until the editor's pending edits reach the document, then returns its main selection as a frozen, host-held `SelectionSnapshot` (`from`, `to`, `startLine`, `endLine`, `text`, `version`, `isDirty`, `sourceSha256`), or `undefined` for an empty selection. |

A selection ending at column 0 excludes that line, as Copy Link for Agent does.
There is no agent API: Copy Link for Agent and Open Copied Agent Reference are
commands. The latter accepts the emitted `@path#start-end` reference or a full
note URI, asks when relative paths match more than one workspace folder, and
uses `open` with an inclusive line-range target. It does not replace native
chat-link handling or add a shared navigation-history stack. Deliberate API
reveals participate in the target pane's local jump history. Source-version and
layout acknowledgment failures reject instead of claiming a completed reveal.

## Vault

The vault is the folder holding a `.obsidian` marker (setting
`markdownWorkshop.vault.rootMarkers`), or the workspace folder.

| Member | Behaviour |
| --- | --- |
| `resolveLink(linktext, source)` | Resolves `Note`, `folder/Note`, `./Note`, `Note#Heading` and aliases as Obsidian does, from the note at `source`. `undefined` when unresolved. |
| `getMetadata(uri)` | Links, embeds, tags, headings, sections, blocks, footnotes, list items, frontmatter, frontmatter links and aliases (`NoteMetadata`). |
| `getBacklinks(uri)` | Notes linking to `uri`, with their vault paths and link counts. |
| `onDidResolveLinks` | Fires with the vault's URI after its links settle (Obsidian's `resolved`). |

## Plugins and settings

| Member | Behaviour |
| --- | --- |
| `getPluginCatalog()` | Every built-in plugin (`core` or `feature`) and every registered external plugin, with title, description, default and surfaces. |
| `getPlugins(editorId)` | Each plugin's state in one editor: `active`, `loading`, `pending` (with `waitingFor`), `failed` (with `error`) or `disabled`. This is what **Markdown Workshop: Show Plugin Status** lists. |
| `setPluginEnabled(id, enabled, scope)` | Writes `markdownWorkshop.plugins.<id>.enabled` (features) or an entry of `markdownWorkshop.plugins.external` (external plugins) at an explicit scope: `{ target: "global" }`, `{ target: "workspace" }` or `{ target: "workspaceFolder", resource }`. Resolves once open editors have applied it, with each editor's new states. Core plugins cannot be turned off (`InvalidArgument`). |
| `resetPluginOverride(id, scope)` | Removes that scope's value, so the next scope or the default applies. |
| `openPluginSettings(resource?)` | Opens Settings at the plugin switches, as **Markdown Workshop: Manage Plugins** does. |
| `plugin(definition)` | Runs an external plugin; see below. |

## Events

All are VS Code `Event`s; listener errors are logged, not rethrown.

| Event | Payload |
| --- | --- |
| `onDidOpenEditor` | `EditorSnapshot` |
| `onDidCloseEditor` | `{ editorId }` |
| `onDidChangeActiveEditor` | `EditorSnapshot \| undefined` |
| `onDidChangeDocument` | `DocumentState` of a note open in Markdown Workshop, after each change and save |
| `onDidChangeSelection` | `{ editorId, hasSelection }` |
| `onDidChangePlugins` | `{ editorId, states }` after plugin states change in an editor |
| `onDidResolveLinks` | `{ vault }` |

## External plugins

An external plugin is a real plugin with the same lifecycle as the built-in
ones: it starts when enabled, stops when disabled, and everything it
registered through its context is undone when it stops. A failure stays
inside the plugin; **Show Plugin Status** shows it as failed with the error.
Authoring guide for a separate consumer extension:
[AGENT.md](AGENT.md) (complementary to [AGENTS.md](AGENTS.md) for Workshop
core).

```ts
const handle = api.plugin({
  id: "acme.badges",              // must start with the owner's publisher: "acme."
  ownerExtensionId: "acme.badges", // an installed extension, publisher.name
  title: "Badges",
  description: "Shows badges on notes.",
  defaultEnabled: true,
  inject: { required: ["editors", "markers"], optional: ["vault"] },
  apply(ctx) {
    // Register through ctx; it is all undone when the plugin stops.
  },
});
context.subscriptions.push(handle); // dispose() unregisters the plugin
```

Rules:

- `id` matches `/^[\w.-]{3,200}$/` (anchored full-string match, same as `validateDefinition`) and starts with the owner's publisher and a
  dot. It cannot repeat a registered or built-in ID
  (`DuplicateContribution`). The owner must be installed (`InvalidArgument`).
  Namespaces prevent accidents; they do not authenticate extensions sharing a
  host.
- **Enablement**: `markdownWorkshop.plugins.external` (`{ "acme.badges":
  false }`) at user, workspace or folder scope, else `defaultEnabled`. A
  plugin enabled for some open notes but not others runs, and receives
  events and requests only for the notes where it is enabled.
- **Isolation**: the context exposes only the services listed in `inject`
  (`PublicServices` below), plus `logger`, `on` and `effect`. Reading
  anything else, internal services included, throws `UndeclaredService`. A
  required service that is unavailable keeps the plugin `pending`. After the
  plugin stops, a retained context throws `PluginDisabled`.
- `apply` may be async; the plugin is `active` when it resolves and `failed`
  if it throws. `handle.settled()` waits for the current transition.
- `handle.state` is the plugin's current state; `handle.setMarkers(editorId,
  markers)` is `ctx.markers.set` for code outside `apply`.

| Service | What it offers |
| --- | --- |
| `editors` | `getEditors`, `getActiveEditor`, `open`, `reveal`, `getSelection`, `registerTitleAction`, `registerSelectionAction` |
| `vault` | `resolveLink`, `getMetadata`, `getBacklinks`, `onDidResolveLinks` |
| `markers` | `set`, `clear`, `registerAction` |
| `commands` | `register(id, run)`: a VS Code command whose ID starts with the owner extension's ID (`acme.badges.refresh`). Declare it in your own `contributes.commands` to show it in the palette. |
| `codeBlocks` | `register(processor)` |
| `logger` | `debug`, `warn`, `error`, written to the **Markdown Workshop** output channel under the plugin's ID |

`ctx.on(name, listener)` subscribes to:

| Event | Listener |
| --- | --- |
| `editor/opened` | `(editor: EditorSnapshot) => void` |
| `editor/closed` | `({ editorId }) => void` |
| `editor/activeChanged` | `(editor \| undefined) => void` |
| `editor/selectionChanged` | `({ editorId, hasSelection }) => void` |
| `links/open` | `(request: LinkRequest) => true \| Promise<true> \| undefined` |

`links/open` runs before Markdown Workshop opens a clicked link
(`{ editorId, href, source, side }`). Return `undefined` to pass, or `true`
(or a promise of `true`) to claim it; the first claim wins, in plugin order
(built-ins first, then external plugins by ID). Unclaimed links follow the
default policy: web and mail links open in the browser, `vscode:` links go to
their extension, other schemes ask first, and note links open in the editor.

`ctx.effect(create)` owns any disposable (`() => Disposable` or `() => () =>
void`), for example a VS Code event subscription, and disposes it when the
plugin stops.

## Markers

A marker is a badge after a range of a note:

```ts
interface SourceMarker {
  id: string;              // unique within this plugin and editor
  from: number; to: number; // source offsets in documentVersion
  documentVersion: number;  // EditorSnapshot.version or TextDocument.version
  label: string;            // ≤ 120 characters
  tooltip?: string;         // plain text, ≤ 1,000 characters
  actionId?: string;        // runs the action registered under this ID
}
```

- `ctx.markers.set(editorId, markers)` replaces this plugin's markers in one
  editor atomically; at most 1,000. `clear(editorId)` removes them.
- Ranges map through edits made after `documentVersion`. A marker whose text
  was deleted is dropped. A range outside its version's text is
  `InvalidArgument`; a version older than the editor's history is
  `StaleSelection`. Recompute on change for best results.
- `registerAction(id, run)` runs `run({ editorId, marker })` in the host when
  the badge is clicked. Duplicate IDs are `DuplicateContribution`.
- Markers of a stopped or disabled plugin disappear.

## Actions

`ctx.editors.registerTitleAction(action)` adds an item to **Note Actions**
(the editor title button), and `registerSelectionAction(action)` to
**Selection Actions** (the editor's context menu and command palette). An
action is `{ id, label, run(context, token) }`; `run` executes in the host
with `{ editorId, selection? }`. A selection action receives a freshly
captured `SelectionSnapshot`. At most 1,000 actions; duplicate IDs per plugin
are `DuplicateContribution`.

## Code block processors

`ctx.codeBlocks.register({ language, render(source, context, token) })`
renders fenced code blocks of one language, like Obsidian's
`registerMarkdownCodeBlockProcessor`. `render` returns `{ markdown }` or
`{ html }` (not both), synchronously or as a promise.

- Processors run only in **trusted workspaces**, and only while the Code
  Blocks plugin is on.
- One processor per language (case-insensitive): a second is
  `DuplicateContribution`. At most 256.
- Output is sanitized and rendered **read-only**: task checkboxes in it do
  not toggle. Rendering nests at most eight levels deep.
- `context` is `{ uri, sourceLine }`; `sourceLine` is a hint for display,
  not an edit target. `token` is cancelled when the editor no longer needs
  the result (the block re-rendered or the editor closed); late results are
  discarded.
- Results are cached by language, source, note and registry generation.

## Errors

API errors are `Error`s with a `code`:

| Code | When |
| --- | --- |
| `EditorNotFound` | The editor is not open (or closed meanwhile). |
| `InvalidArgument` | A malformed argument, a target outside the note, a forged selection, a namespace violation. |
| `PluginDisabled` | The feature or the external plugin is off, or its context is no longer live. |
| `StaleSelection` | The selection's or marker's document version moved on. |
| `DocumentDirty` | An agent reference for a note with unsaved changes. |
| `SourceChanged` | The note changed while an operation was running. |
| `Cancelled` | The operation's token was cancelled, or it timed out. |
| `DuplicateContribution` | A plugin ID, marker ID, action, or processor language is already registered. |
| `UndeclaredService` | An external plugin read a service it did not inject. |
| `WorkspaceUntrusted` | A code block processor in an untrusted workspace. |

## Complete example

The sample in [`test/fixtures/sample-plugin/`](test/fixtures/sample-plugin/)
is a complete extension, used by the manual test plan and run against the
real facade by `test/unit/api/sample-plugin.test.ts`. It puts a `TODO` badge
after every TODO, claims `ticket:NUMBER` links, renders ```` ```tickets ````
blocks and registers a command. Build it with `pnpm sample`.

`package.json` (the parts that matter):

```json
{
  "name": "tickets",
  "publisher": "mwsample",
  "main": "./dist/extension.js",
  "extensionDependencies": ["t04dj14n9.vscode-markdown-workshop"],
  "activationEvents": ["onLanguage:markdown", "onCustomEditor:markdownWorkshop.editor"],
  "contributes": {
    "commands": [{ "command": "mwsample.tickets.refresh", "title": "Refresh TODO Badges", "category": "Sample Tickets" }],
    "configuration": {
      "properties": {
        "mwsampleTickets.baseUrl": { "type": "string", "default": "https://github.com/t04dJ14n9/vscode-markdown-workbench/issues/" }
      }
    }
  }
}
```

`src/extension.ts`:

```ts
import * as vscode from "vscode";
import type { MarkdownWorkshopApi } from "./markdown-workshop/types";
import { ticketsPlugin } from "./plugin";

export async function activate(context: vscode.ExtensionContext) {
  const api = await vscode.extensions
    .getExtension<MarkdownWorkshopApi>("t04dj14n9.vscode-markdown-workshop")
    ?.activate();
  if (api?.apiVersion !== 1) {
    void vscode.window.showWarningMessage(
      "Sample Tickets needs Markdown Workshop with API version 1.",
    );
    return;
  }
  // Disposing the handle unregisters the plugin and undoes everything it
  // registered: markers, the link claim, the processor and the command.
  context.subscriptions.push(api.plugin(ticketsPlugin(vscode)));
}
```

`src/plugin.ts`:

```ts
import type * as vscode from "vscode";
import type {
  EditorSnapshot,
  ExternalPlugin,
  ProcessorResult,
  SourceMarker,
} from "./markdown-workshop/types";

export type VSCode = Pick<typeof vscode, "workspace" | "window" | "env" | "Uri">;

export function todoMarkers(text: string, version: number): SourceMarker[] {
  const markers: SourceMarker[] = [];
  for (const match of text.matchAll(/\bTODO\b/g)) {
    const line = text.slice(0, match.index).split("\n").length;
    markers.push({
      id: `todo-${match.index}`,
      from: match.index,
      to: match.index + match[0].length,
      documentVersion: version,
      label: "TODO",
      tooltip: `TODO on line ${line}. Click for details.`,
      actionId: "describe",
    });
  }
  return markers.slice(0, 1000);
}

export function ticketList(source: string): ProcessorResult {
  const numbers = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d{1,9}$/.test(line));
  if (numbers.length === 0) {
    return { markdown: "*No tickets.*" };
  }
  return {
    markdown: numbers
      .map((number) => `- [Ticket ${number}](ticket:${number})`)
      .join("\n"),
  };
}

export function ticketsPlugin(code: VSCode): ExternalPlugin {
  return {
    id: "mwsample.tickets",
    ownerExtensionId: "mwsample.tickets",
    title: "Sample Tickets",
    description: "TODO badges, ticket: links and tickets code blocks.",
    defaultEnabled: true,
    inject: { required: ["editors", "markers", "commands", "codeBlocks"] },
    apply(ctx) {
      const refresh = async (editor: EditorSnapshot) => {
        const document = await code.workspace.openTextDocument(editor.uri);
        // Markers name the version their offsets belong to; the editor maps
        // them through any later edits.
        ctx.markers.set(
          editor.editorId,
          todoMarkers(document.getText(), document.version),
        );
      };
      const refreshAll = () =>
        Promise.all(ctx.editors.getEditors().map(refresh));

      ctx.on("editor/opened", (editor) => void refresh(editor));
      ctx.effect(() =>
        code.workspace.onDidChangeTextDocument((event) => {
          const changed = event.document.uri.toString();
          for (const editor of ctx.editors.getEditors()) {
            if (editor.uri.toString() === changed) {
              void refresh(editor);
            }
          }
        }),
      );
      ctx.markers.registerAction("describe", ({ marker }) => {
        void code.window.showInformationMessage(marker.tooltip ?? "TODO");
      });

      const openTicket = async (number: string): Promise<true> => {
        const base = code.workspace
          .getConfiguration("mwsampleTickets")
          .get<string>("baseUrl", "");
        await code.env.openExternal(code.Uri.parse(`${base}${number}`));
        return true;
      };
      ctx.on("links/open", (request) => {
        const number = /^ticket:(\d{1,9})$/.exec(request.href)?.[1];
        return number ? openTicket(number) : undefined;
      });

      ctx.codeBlocks.register({
        language: "tickets",
        render: (source) => ticketList(source),
      });

      ctx.commands.register("mwsample.tickets.refresh", refreshAll);
      void refreshAll();
    },
  };
}
```

In the fixture the type imports point at `src/host/api/types` instead of a
copied `markdown-workshop/types`.

## Bridge envelope

`markdownWorkshop.bridge.envelope` returns the versioned selection envelope
described in [docs/bridge-envelope.md](docs/bridge-envelope.md). It is a VS
Code command, not a method on API v1. Pass an optional wiki context
(`preset`, `bundle`, `collection`, `type`); a malformed argument is ignored.
The command does not open a chat. Agent PDF Viewer may call it. This
extension calls `vscodeEmbedPdf.bridge.envelope` only when that command is
registered.

## Not in version 1

- Webview modules (scripts or styles from other extensions inside the
  editor) are designed for version 2 (DESIGN §18.5).
- Plugins cannot change how Markdown is parsed, as in Obsidian.
- Writing note text goes through VS Code (`WorkspaceEdit`); the editor
  follows the document.
