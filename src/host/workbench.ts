import { registerNativeLinks } from "./native-links";
import { renameFile } from "./file-rename";
import { createNavigation } from "./navigation";
import { readSettings } from "./settings";
import { createSettingsAccess } from "./settings-access";
import type { SettingsReader } from "./settings";
import * as vscode from "vscode";
import { textBypass } from "./reclaim";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type {
  CopyLinkTarget,
  HostDocument,
  PanelShell,
  Workbench,
} from "../shared/runtime";
import { SourceCoordinates } from "../shared/document/coordinates";
import { registerEditor } from "./editor-panels";

export function createWorkbench(
  extensionUri: vscode.Uri,
  storage?: vscode.Memento,
): Workbench {
  const documents = new NativeDocuments();
  const panels = new Map<string, PanelShell>();
  const navigation = createNavigation(() => [...panels.values()]);
  return {
    registerNativeLinks: () => {
      const links = registerNativeLinks(navigation);
      return () => links.dispose();
    },
    ...(storage && { storage }),
    isTrusted: () => vscode.workspace.isTrusted,
    workspaceFolders: () =>
      (vscode.workspace.workspaceFolders ?? []).map((folder) =>
        folder.uri.toString(),
      ),
    workerPath: (name) =>
      vscode.Uri.joinPath(extensionUri, "dist", "workers", `${name}.cjs`)
        .fsPath,
    renameFile,
    navigation,
    fingerprint(text) {
      return createHash("sha256").update(text).digest("hex");
    },
    ...documentOperations(documents),
    ...commandOperations(),
    ...agentOperations(),
    ...configurationOperations(),
    settings: createSettingsAccess(),
    editorAssociations: workspaceEditorAssociations(),
    ...fileOperations(),
    registerEditor: (provider, open) =>
      registerEditor(provider, { extensionUri, documents }, (panel) => {
        panels.set(panel.id, panel);
        panel.onDispose(() => {
          panels.delete(panel.id);
        });
        open(panel);
      }),
  };
}

/** Stable adapter identity with live getters; the native document remains authoritative. */
export class NativeDocuments {
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
/** Extensions that bring an agent chat of their own besides the editor's. */
const AGENT_EXTENSIONS = ["anthropic.claude-code", "openai.chatgpt"];

/** Copy Link for Agent: which agent chats exist, and files to attach. */
function agentOperations(): Pick<
  Workbench,
  "agentEnvironment" | "writeScratchFile"
> {
  return {
    async agentEnvironment() {
      return {
        target: vscode.workspace
          .getConfiguration("markdownWorkbench")
          .get<CopyLinkTarget>("copyLinkForAgent.target", "auto"),
        agentExtensions: new Set(
          AGENT_EXTENSIONS.filter((id) => vscode.extensions.getExtension(id)),
        ),
        commands: new Set(await vscode.commands.getCommands(true)),
        hasChatParticipant: vscode.extensions.all.some((extension) => {
          const participants = (
            extension.packageJSON as
              | { contributes?: { chatParticipants?: unknown } }
              | undefined
          )?.contributes?.chatParticipants;
          return Array.isArray(participants) && participants.length > 0;
        }),
        chatDisabled: vscode.workspace
          .getConfiguration("chat")
          .get<boolean>("disableAIFeatures", false),
      };
    },
    async writeScratchFile(name, text) {
      const folder = path.join(os.tmpdir(), "markdown-workbench-agent");
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const file = path.join(folder, path.basename(name));
      await writeFile(file, text, { mode: 0o600 });
      return vscode.Uri.file(file).toString();
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
        if (args[1] === "default") {
          // Opened as text on purpose: the reclaim must not undo it.
          textBypass.allow(args[0]);
        }
        args[0] = vscode.Uri.parse(args[0]);
      }
      if (id === "chatgpt.addFileToThread" && typeof args[0] === "string") {
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
      const configuration = vscode.workspace.getConfiguration(undefined, {
        uri,
        languageId: "markdown",
      });
      const native: SettingsReader = {
        get: <T>(key: string, fallback?: T) => {
          if (key.endsWith("#default")) {
            return configuration.inspect(key.slice(0, -8))?.defaultValue as
              | T
              | undefined;
          }
          if (key.endsWith("#explicit")) {
            const values = configuration.inspect(key.slice(0, -9));
            return Boolean(
              values &&
                [
                  values.globalValue,
                  values.workspaceValue,
                  values.workspaceFolderValue,
                  values.globalLanguageValue,
                  values.workspaceLanguageValue,
                  values.workspaceFolderLanguageValue,
                ].some((value) => value !== undefined),
            ) as T;
          }
          return configuration.get<T>(key, fallback as T);
        },
      };
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
