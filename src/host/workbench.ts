import { createNavigation } from "./navigation";
import { features } from "../plugins/catalog";
import * as vscode from "vscode";
import { randomUUID, createHash } from "node:crypto";
import type { HostDocument, Workbench, PanelShell } from "../shared/runtime";
import { SourceCoordinates } from "../shared/document/coordinates";
const viewType = "markdownWorkbench.editor";
export function createWorkbench(extensionUri: vscode.Uri): Workbench {
  const wrappers = new WeakMap<vscode.TextDocument, HostDocument>(),
    originals = new WeakMap<HostDocument, vscode.TextDocument>();
  function wrap(document: vscode.TextDocument): HostDocument {
    let wrapped = wrappers.get(document);
    if (!wrapped) {
      wrapped = {
        id: document.uri.toString(),
        uri: document.uri.toString(),
        get version() {
          return document.version;
        },
        get isDirty() {
          return document.isDirty;
        },
        get isUntitled() {
          return document.isUntitled;
        },
        get eol() {
          return document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
        },
        getText: () => document.getText(),
        save: async () => document.save(),
      };
      wrappers.set(document, wrapped);
      originals.set(wrapped, document);
    }
    return wrapped;
  }
  return {
    navigation: createNavigation(),
    async openDocument(uri) { return wrap(await vscode.workspace.openTextDocument(vscode.Uri.parse(uri))); },
    fingerprint(text) {
      return createHash("sha256").update(text).digest("hex");
    },
    async apply(document, edits) {
      const native = originals.get(document);
      if (!native) throw new Error("Unknown document");
      const coordinates = new SourceCoordinates(native.getText()),
        edit = new vscode.WorkspaceEdit();
      for (const change of edits)
        edit.replace(
          native.uri,
          new vscode.Range(
            native.positionAt(coordinates.toSource(change.from)),
            native.positionAt(coordinates.toSource(change.to)),
          ),
          change.insert,
        );
      return vscode.workspace.applyEdit(edit);
    },
    onChange(listener) {
      const stop = vscode.workspace.onDidChangeTextDocument((event) =>
        listener(wrap(event.document)),
      );
      return () => stop.dispose();
    },
    onSave(listener) {
      const stop = vscode.workspace.onDidSaveTextDocument((document) =>
        listener(wrap(document)),
      );
      return () => stop.dispose();
    },
    onWillSave(listener) {
      const stop = vscode.workspace.onWillSaveTextDocument((event) => {
        event.waitUntil(listener(wrap(event.document)));
      });
      return () => stop.dispose();
    },
    command(id, run) {
      const stop = vscode.commands.registerCommand(id, run);
      return () => stop.dispose();
    },
    async execute(id, ...args) {
      if (id === "vscode.openWith" && typeof args[0] === "string")
        args[0] = vscode.Uri.parse(args[0]);
      return vscode.commands.executeCommand(id, ...args);
    },
    clipboard: {
      read: async () => vscode.env.clipboard.readText(),
      write: async (text) => vscode.env.clipboard.writeText(text),
    },
    error(message) {
      void vscode.window.showErrorMessage(message);
    },
    onConfiguration(listener) {
      const subscription = vscode.workspace.onDidChangeConfiguration(listener);
      return () => subscription.dispose();
    },
    config(document) {
      const config = vscode.workspace.getConfiguration(
        "markdownWorkbench",
        vscode.Uri.parse(document.uri),
      );
      return {
        features: Object.fromEntries(
          features.map((manifest) => {
            const properties =
              (manifest.config?.toJSONSchema().properties as Record<
                string,
                unknown
              >) ?? {};
            return [
              manifest.id,
              {
                enabled: config.get(
                  `plugins.${manifest.id}.enabled`,
                  manifest.defaultEnabled,
                ),
                config:
                  (manifest.config?.parse(
                    Object.fromEntries(
                      Object.keys(properties).map((key) => [
                        key,
                        config.get(`${manifest.id}.${key}`),
                      ]),
                    ),
                  ) as Record<string, unknown>) ?? {},
              },
            ];
          }),
        ),
        preset: config.get("preset", "obsidian"),
        mode: config.get("editor.defaultMode", "livePreview"),
      };
    },
    root(document) {
      return (
        vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(document.uri))
          ?.uri ?? vscode.Uri.joinPath(vscode.Uri.parse(document.uri), "..")
      ).toString();
    },
    async files(root) {
      const base = vscode.Uri.parse(root);
      const uris = await vscode.workspace.findFiles(
        new vscode.RelativePattern(base, "**/*"),
        "**/{.git,node_modules}/**",
        25000,
      );
      return Promise.all(
        uris.map(async (uri) => {
          const info = await vscode.workspace.fs.stat(uri);
          return {
            uri: uri.toString(),
            path: uri.path.slice(base.path.replace(/\/$/, "").length + 1),
            mtime: info.mtime,
            size: info.size,
            symbolicLink: Boolean(info.type & vscode.FileType.SymbolicLink),
          };
        }),
      );
    },
    async read(uri) {
      return vscode.workspace.fs.readFile(vscode.Uri.parse(uri));
    },
    async stat(uri) {
      const info = await vscode.workspace.fs.stat(vscode.Uri.parse(uri));
      return {
        mtime: info.mtime,
        symbolicLink: Boolean(info.type & vscode.FileType.SymbolicLink),
      };
    },
    registerEditor(open) {
      const registration = vscode.window.registerCustomEditorProvider(
        viewType,
        {
          resolveCustomTextEditor(document, panel) {
            const id = randomUUID(),
              root =
                vscode.workspace.getWorkspaceFolder(document.uri)?.uri ??
                vscode.Uri.joinPath(document.uri, "..");
            panel.webview.options = {
              enableScripts: true,
              localResourceRoots: [
                vscode.Uri.joinPath(extensionUri, "dist"),
                root,
              ],
            };
            const shell: PanelShell = {
              id,
              document: wrap(document),
              cspSource: panel.webview.cspSource,
              trusted: vscode.workspace.isTrusted,
              transport: {
                send(message) {
                  void panel.webview.postMessage(message);
                },
                listen(receive) {
                  const stop = panel.webview.onDidReceiveMessage(receive);
                  return () => stop.dispose();
                },
              },
              active() {
                const group = vscode.window.tabGroups.activeTabGroup,
                  input = group.activeTab?.input;
                return (
                  group.viewColumn === panel.viewColumn &&
                  input instanceof vscode.TabInputCustom &&
                  input.viewType === viewType &&
                  input.uri.toString() === document.uri.toString()
                );
              },
              reveal() {
                panel.reveal();
              },
              dispose() {
                panel.dispose();
              },
              setHTML(html) {
                panel.webview.html = html;
              },
              resource(uri) {
                return panel.webview
                  .asWebviewUri(vscode.Uri.parse(uri))
                  .toString();
              },
              asset(relative) {
                return panel.webview
                  .asWebviewUri(
                    vscode.Uri.joinPath(extensionUri, "dist", relative),
                  )
                  .toString();
              },
              onDispose(listener) {
                const stop = panel.onDidDispose(listener);
                return () => stop.dispose();
              },
              onState(listener) {
                const a = panel.onDidChangeViewState(listener),
                  b = vscode.window.tabGroups.onDidChangeTabGroups(listener);
                return () => {
                  a.dispose();
                  b.dispose();
                };
              },
            };
            open(shell);
          },
        },
        {
          webviewOptions: { retainContextWhenHidden: true },
          supportsMultipleEditorsPerDocument: true,
        },
      );
      return () => registration.dispose();
    },
  };
}
