import * as vscode from "vscode";
import { handoffLease } from "./reclaim";
import { warmMarkdownDocument } from "./document-warm";
import type {
  HandoffSurface,
  NativeDocument,
} from "../plugins/cursorBridge/handoff";

/** VS Code surface for cursorBridge selection mirror + reclaim lease. */
export function createCursorHandoffSurface(): HandoffSurface {
  return {
    acquireLease(uri) {
      handoffLease.acquire(uri);
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
      return {
        document: wrapDocument(editor.document),
        selection: {
          start: {
            line: editor.selection.start.line,
            character: editor.selection.start.character,
          },
          end: {
            line: editor.selection.end.line,
            character: editor.selection.end.character,
          },
        },
      };
    },
  };
}

function wrapDocument(document: vscode.TextDocument): NativeDocument {
  return {
    uri: document.uri.toString(),
    version: document.version,
    getText: () => document.getText(),
    positionAt: (offset) => {
      const position = document.positionAt(offset);
      return { line: position.line, character: position.character };
    },
  };
}
