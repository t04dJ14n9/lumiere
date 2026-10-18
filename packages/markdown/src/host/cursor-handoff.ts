import * as vscode from "vscode";
import { handoffLease } from "./reclaim";
import { warmMarkdownDocument } from "./document-warm";
import type {
  HandoffSurface,
  NativeDocument,
  NativeEditor,
} from "../plugins/cursorBridge/handoff";

/** Language id Cursor Edit / outline expect for note mirrors. */
const MARKDOWN_LANGUAGE = "markdown";

/** VS Code surface for cursorBridge selection mirror + reclaim lease. */
export function createCursorHandoffSurface(): HandoffSurface {
  return {
    acquireLease(uri) {
      return handoffLease.acquire(uri);
    },
    nativeUri(uri) {
      return vscode.Uri.parse(uri);
    },
    async warm(uri) {
      await warmMarkdownDocument(vscode.Uri.parse(uri));
    },
    async open(uri) {
      const document = await openMarkdownDocument(vscode.Uri.parse(uri));
      return wrapDocument(document);
    },
    async show(document, range) {
      const native = await openMarkdownDocument(vscode.Uri.parse(document.uri));
      const editor = await vscode.window.showTextDocument(native, {
        preview: false,
        preserveFocus: false,
        selection: new vscode.Range(
          new vscode.Position(range.start.line, range.start.character),
          new vscode.Position(range.end.line, range.end.character),
        ),
      });
      return wrapEditor(editor);
    },
    async dismiss(uri) {
      const target = vscode.Uri.parse(uri).toString();
      const active = vscode.window.activeTextEditor;
      if (active?.document.uri.toString() === target) {
        await vscode.commands.executeCommand(
          "workbench.action.closeActiveEditor",
        );
        return;
      }
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          if (
            tab.input instanceof vscode.TabInputText &&
            tab.input.uri.toString() === target
          ) {
            await vscode.window.tabGroups.close(tab);
            return;
          }
        }
      }
    },
  };
}

/**
 * Open the note as a TextDocument with language `markdown`.
 *
 * User `files.associations` may map `*.md` to a custom-editor viewType string
 * (not a language id). That makes mirrors report Plain Text and can leave
 * Cursor’s Edit handler without a usable model. Force the real language id.
 */
async function openMarkdownDocument(
  uri: vscode.Uri,
): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument(uri);
  if (document.languageId === MARKDOWN_LANGUAGE) {
    return document;
  }
  try {
    return await vscode.languages.setTextDocumentLanguage(
      document,
      MARKDOWN_LANGUAGE,
    );
  } catch {
    return document;
  }
}

function wrapEditor(editor: vscode.TextEditor): NativeEditor {
  return {
    get document() {
      return wrapDocument(editor.document);
    },
    get selection() {
      return editor.selection;
    },
    isActive: () => vscode.window.activeTextEditor === editor,
  };
}

function wrapDocument(document: vscode.TextDocument): NativeDocument {
  return {
    uri: document.uri.toString(),
    get version() {
      return document.version;
    },
    getText: () => document.getText(),
    positionAt: (offset) => {
      const position = document.positionAt(offset);
      return { line: position.line, character: position.character };
    },
  };
}
