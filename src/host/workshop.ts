import { registerNativeLinks } from "./native-links";
import { renameFile } from "./file-rename";
import { createNavigation } from "./navigation";
import { readSettings } from "./settings";
import { createConfiguration } from "./configuration-access";
import type { Configuration } from "../shared/configuration";
import { createSettingsAccess } from "./settings-access";
import { createDiagnostics } from "./diagnostics";
import { createGitAccess } from "./git";
import { createDiffViews } from "./diff-views";
import { createWorkspaceFiles } from "./workspace-files";
import type { SettingsReader } from "./settings";
import * as vscode from "vscode";
import { textBypass } from "./reclaim";
import { warmMarkdownDocument } from "./document-warm";
import { MARKDOWN_EDITOR } from "../shared/editor-provider";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type {
  CopyLinkTarget,
  HostDocument,
  PanelShell,
  Workshop,
} from "../shared/runtime";
import { SourceCoordinates } from "../shared/document/coordinates";
import { registerEditor } from "./editor-panels";

export function createWorkshop(
  extensionUri: vscode.Uri,
  storage?: vscode.Memento,
  configuration: Configuration = createConfiguration(),
): Workshop {
  const documents = new NativeDocuments();
  const panels = new Map<string, PanelShell>();
  const navigation = createNavigation(
    () => [...panels.values()],
    configuration,
  );
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
    configuration,
    ...configurationOperations(configuration),
    settings: createSettingsAccess(),
    editorAssociations: workspaceEditorAssociations(),
    ...fileOperations(),
    files: createWorkspaceFiles(),
    diagnostics: createDiagnostics(),
    git: createGitAccess(),
    diffViews: createDiffViews(extensionUri),
    revealTextEditor,
    hasExtension: (id) => Boolean(vscode.extensions.getExtension(id)),
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
  Workshop,
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
  Workshop,
  "agentEnvironment" | "writeScratchFile"
> {
  return {
    async agentEnvironment() {
      return {
        target: vscode.workspace
          .getConfiguration("markdownWorkshop")
          .get<CopyLinkTarget>("copyLinkForAgent.target", "auto"),
        agentExtensions: new Set(
          AGENT_EXTENSIONS.filter((id) => vscode.extensions.getExtension(id)),
        ),
        commands: new Set(await vscode.commands.getCommands(true)),
        hasChatParticipant: vscode.extensions.all.some((extension) => {
          const participants = (
            extension.packageJSON as
              { contributes?: { chatParticipants?: unknown } } | undefined
          )?.contributes?.chatParticipants;
          return Array.isArray(participants) && participants.length > 0;
        }),
        chatDisabled: vscode.workspace
          .getConfiguration("chat")
          .get<boolean>("disableAIFeatures", false),
      };
    },
    async writeScratchFile(name, text) {
      const folder = path.join(os.tmpdir(), "markdown-workshop-agent");
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const file = path.join(folder, path.basename(name));
      await writeFile(file, text, { mode: 0o600 });
      return vscode.Uri.file(file).toString();
    },
  };
}
const URI_COMMANDS = new Set([
  "vscode.open",
  "vscode.openWith",
  "markdown.showPreview",
  "markdown.showPreviewToSide",
  "chatgpt.addFileToThread",
]);

function commandArguments(id: string, args: unknown[]): unknown[] {
  if (!URI_COMMANDS.has(id) || typeof args[0] !== "string") {
    return args;
  }
  if (id === "vscode.openWith" && args[1] === "default") {
    // Opened as text on purpose: the reclaim must not undo it.
    textBypass.allow(args[0]);
  }
  const next = [...args];
  next[0] = vscode.Uri.parse(args[0]);
  return next;
}

async function revealTextEditor(uri: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.parse(uri),
  );
  await vscode.window.showTextDocument(document, {
    viewColumn: vscode.ViewColumn.Beside,
    preview: true,
    preserveFocus: false,
  });
}

function commandOperations(): Pick<
  Workshop,
  "command" | "execute" | "clipboard" | "error" | "inform"
> {
  return {
    command(id, run) {
      const stop = vscode.commands.registerCommand(id, run);
      return () => stop.dispose();
    },
    async execute(id, ...args) {
      const nativeArgs = commandArguments(id, args);
      if (
        id === "vscode.openWith" &&
        nativeArgs[1] === MARKDOWN_EDITOR.viewType
      ) {
        await warmMarkdownDocument(nativeArgs[0] as vscode.Uri);
      }
      return vscode.commands.executeCommand(id, ...nativeArgs);
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
  Workshop["editorAssociations"]
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
function configurationOperations(
  settings: Configuration,
): Pick<Workshop, "onConfiguration" | "config"> {
  return {
    onConfiguration(listener) {
      return settings.onDidChange(listener);
    },
    config(document) {
      const uri = vscode.Uri.parse(document.uri);
      const config: SettingsReader = {
        get: (key, fallback) => settings.get(key, fallback, document.uri),
      };
      // Native editor settings as they apply to Markdown files.
      const configuration = vscode.workspace.getConfiguration(undefined, {
        uri,
        languageId: "markdown",
      });
      const native: SettingsReader = {
        get: <T>(key: string, fallback?: T) => {
          if (key.endsWith("#default")) {
            return configuration.inspect(key.slice(0, -8))?.defaultValue as
              T | undefined;
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
function fileOperations(): Pick<Workshop, "read" | "stat" | "watchFile"> {
  return {
    watchFile(uri, listener) {
      const target = vscode.Uri.parse(uri);
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.joinPath(target, ".."), "*"),
      );
      const changed = (file: vscode.Uri) => {
        if (file.toString() === target.toString()) {
          listener();
        }
      };
      const subscriptions = [
        watcher,
        watcher.onDidCreate(changed),
        watcher.onDidChange(changed),
        watcher.onDidDelete(changed),
      ];
      return () =>
        subscriptions.forEach((subscription) => subscription.dispose());
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
  };
}
