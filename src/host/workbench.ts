import { renameFile } from "./file-rename";
import { createNavigation } from "./navigation";
import { readSettings } from "./settings";
import * as vscode from "vscode";
import { randomUUID, createHash } from "node:crypto";
import type { HostDocument, Workbench, PanelShell } from "../shared/runtime";
import { SourceCoordinates } from "../shared/document/coordinates";
const viewType = "markdownWorkbench.editor";

export function createWorkbench(
  extensionUri: vscode.Uri,
  storage?: vscode.Memento,
): Workbench {
  const documents = new NativeDocuments();
  return {
    storage,
    isTrusted: () => vscode.workspace.isTrusted,
    workspaceFolders: () =>
      (vscode.workspace.workspaceFolders ?? []).map((folder) =>
        folder.uri.toString(),
      ),
    workerPath: (name) =>
      vscode.Uri.joinPath(extensionUri, "dist", "workers", `${name}.cjs`)
        .fsPath,
    renameFile,
    navigation: createNavigation(),
    fingerprint(text) {
      return createHash("sha256").update(text).digest("hex");
    },
    ...documentOperations(documents),
    ...commandOperations(),
    ...configurationOperations(),
    editorAssociations: workspaceEditorAssociations(),
    ...fileOperations(),
    registerEditor: (open) => registerEditor(extensionUri, documents, open),
  };
}

/** Stable adapter identity with live getters; the native document remains authoritative. */
class NativeDocuments {
  private readonly wrappers = new WeakMap<vscode.TextDocument, HostDocument>();
  private readonly originals = new WeakMap<HostDocument, vscode.TextDocument>();
  native(document: HostDocument): vscode.TextDocument {
    const native = this.originals.get(document);
    if (!native) {
      throw new Error("Unknown document");
    }
    return native;
  }

  wrap(document: vscode.TextDocument): HostDocument {
    let wrapped = this.wrappers.get(document);
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
      this.wrappers.set(document, wrapped);
      this.originals.set(wrapped, document);
    }
    return wrapped;
  }
}
function documentOperations(
  documents: NativeDocuments,
): Pick<
  Workbench,
  "openDocument" | "apply" | "onChange" | "onSave" | "onWillSave"
> {
  return {
    async openDocument(uri) {
      return documents.wrap(
        await vscode.workspace.openTextDocument(vscode.Uri.parse(uri)),
      );
    },
    async apply(document, edits) {
      const native = documents.native(document);
      const coordinates = new SourceCoordinates(native.getText());
      const edit = new vscode.WorkspaceEdit();
      for (const change of edits) {
        edit.replace(
          native.uri,
          new vscode.Range(
            native.positionAt(coordinates.toSource(change.from)),
            native.positionAt(coordinates.toSource(change.to)),
          ),
          change.insert,
        );
      }
      return vscode.workspace.applyEdit(edit);
    },
    onChange(listener) {
      const stop = vscode.workspace.onDidChangeTextDocument((event) =>
        listener(
          documents.wrap(event.document),
          event.contentChanges.map((change) => ({
            from: change.rangeOffset,
            to: change.rangeOffset + change.rangeLength,
            insert: change.text,
          })),
        ),
      );
      return () => stop.dispose();
    },
    onSave(listener) {
      const stop = vscode.workspace.onDidSaveTextDocument((document) =>
        listener(documents.wrap(document)),
      );
      return () => stop.dispose();
    },
    onWillSave(listener) {
      const stop = vscode.workspace.onWillSaveTextDocument((event) => {
        event.waitUntil(listener(documents.wrap(event.document)));
      });
      return () => stop.dispose();
    },
  };
}
function commandOperations(): Pick<
  Workbench,
  "command" | "execute" | "clipboard" | "error" | "inform"
> {
  return {
    command(id, run) {
      const stop = vscode.commands.registerCommand(id, run);
      return () => stop.dispose();
    },
    async execute(id, ...args) {
      if (id === "vscode.openWith" && typeof args[0] === "string") {
        args[0] = vscode.Uri.parse(args[0]);
      }
      return vscode.commands.executeCommand(id, ...args);
    },
    clipboard: {
      read: async () => vscode.env.clipboard.readText(),
      write: async (text) => vscode.env.clipboard.writeText(text),
    },
    error(message) {
      void vscode.window.showErrorMessage(message);
    },
    inform(message) {
      void vscode.window.showInformationMessage(message);
    },
  };
}
function workspaceEditorAssociations(): NonNullable<
  Workbench["editorAssociations"]
> {
  const settings = () => vscode.workspace.getConfiguration("workbench");
  return {
    read() {
      if (!vscode.workspace.workspaceFolders?.length) {
        return undefined;
      }
      return settings().inspect("editorAssociations")?.workspaceValue ?? {};
    },
    async write(associations) {
      await settings().update(
        "editorAssociations",
        associations,
        vscode.ConfigurationTarget.Workspace,
      );
    },
  };
}
function configurationOperations(): Pick<
  Workbench,
  "onConfiguration" | "config"
> {
  return {
    onConfiguration(listener) {
      const subscription = vscode.workspace.onDidChangeConfiguration(listener);
      return () => subscription.dispose();
    },
    config(document) {
      const uri = vscode.Uri.parse(document.uri);
      const config = vscode.workspace.getConfiguration(
        "markdownWorkbench",
        uri,
      );
      // Native editor settings as they apply to Markdown files.
      const native = vscode.workspace.getConfiguration(undefined, {
        uri,
        languageId: "markdown",
      });
      return readSettings(config, native);
    },
  };
}
function fileOperations(): Pick<Workbench, "read" | "stat"> {
  return {
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
  };
}
function panelTransport(panel: vscode.WebviewPanel): PanelShell["transport"] {
  return {
    send(message) {
      void panel.webview.postMessage(message);
    },
    listen(receive) {
      const stop = panel.webview.onDidReceiveMessage(receive);
      return () => stop.dispose();
    },
  };
}
function isActivePanel(
  document: vscode.TextDocument,
  panel: vscode.WebviewPanel,
): boolean {
  const group = vscode.window.tabGroups.activeTabGroup;
  const input = group.activeTab?.input;
  return (
    group.viewColumn === panel.viewColumn &&
    input instanceof vscode.TabInputCustom &&
    input.viewType === viewType &&
    input.uri.toString() === document.uri.toString()
  );
}
function panelState(
  panel: vscode.WebviewPanel,
  listener: () => void,
): ReturnType<PanelShell["onState"]> {
  const panelSubscription = panel.onDidChangeViewState(listener);
  const groupSubscription =
    vscode.window.tabGroups.onDidChangeTabGroups(listener);
  return () => {
    panelSubscription.dispose();
    groupSubscription.dispose();
  };
}
function createPanelShell(
  document: vscode.TextDocument,
  panel: vscode.WebviewPanel,
  extensionUri: vscode.Uri,
  documents: NativeDocuments,
): PanelShell {
  const id = randomUUID();
  const root =
    vscode.workspace.getWorkspaceFolder(document.uri)?.uri ??
    vscode.Uri.joinPath(document.uri, "..");
  panel.webview.options = {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist"), root],
  };

  return {
    id,
    get column() {
      return panel.viewColumn;
    },
    document: documents.wrap(document),
    cspSource: panel.webview.cspSource,
    trusted: vscode.workspace.isTrusted,
    transport: panelTransport(panel),
    active: () => isActivePanel(document, panel),
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
      return panel.webview.asWebviewUri(vscode.Uri.parse(uri)).toString();
    },
    asset(relative) {
      return panel.webview
        .asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", relative))
        .toString();
    },
    onDispose(listener) {
      const stop = panel.onDidDispose(listener);
      return () => stop.dispose();
    },
    onState: (listener) => panelState(panel, listener),
  };
}
function registerEditor(
  extensionUri: vscode.Uri,
  documents: NativeDocuments,
  open: (panel: PanelShell) => void,
) {
  const registration = vscode.window.registerCustomEditorProvider(
    viewType,
    {
      resolveCustomTextEditor(document, panel) {
        const shell = createPanelShell(
          document,
          panel,
          extensionUri,
          documents,
        );
        open(shell);
      },
    },
    {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    },
  );
  return () => registration.dispose();
}
