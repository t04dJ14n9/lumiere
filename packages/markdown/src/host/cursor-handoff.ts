import * as vscode from "vscode";
import { handoffLease } from "./reclaim";
import { warmMarkdownDocument } from "./document-warm";
import type {
  HandoffSurface,
  NativeDocument,
  NativeEditor,
} from "../plugins/cursorBridge/handoff";

/** VS Code surface for cursorBridge selection mirror + reclaim lease. */
export function createCursorHandoffSurface(): HandoffSurface {
  return {
    acquireLease(uri) {
      return handoffLease.acquire(uri);
    },
    async warm(uri) {
      await warmMarkdownDocument(vscode.Uri.parse(uri));
    },
    async open(uri) {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.parse(uri),
      );
      return wrapDocument(document);
    },
    async show(document, range) {
      const native = await vscode.workspace.openTextDocument(
        vscode.Uri.parse(document.uri),
      );
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
  };
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
