import * as vscode from "vscode";
import type { Digests } from "@workshop/platform";
import { SourceCoordinates } from "../../shared/document/coordinates";
import type { FileTextEdits, HostDocuments } from "../../shared/host";
import { renameFile } from "../file-rename";
import { cleanEditedUris } from "../rename-save";
import type { NativeDocuments } from "./native-documents";

/** VS Code's text documents, wrapped as `HostDocument`s by `documents`. */
export function createHostDocuments(
  documents: NativeDocuments,
  digests: Digests,
): HostDocuments {
  return {
    fingerprint: (text) => digests.sha256(text),
    apply: async (document, edits) => {
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
    onChange: (listener) =>
      toDisposer(
        vscode.workspace.onDidChangeTextDocument((event) =>
          listener(
            documents.wrap(event.document),
            event.contentChanges.map((change) => ({
              from: change.rangeOffset,
              to: change.rangeOffset + change.rangeLength,
              insert: change.text,
            })),
          ),
        ),
      ),
    onSave: (listener) =>
      toDisposer(
        vscode.workspace.onDidSaveTextDocument((document) =>
          listener(documents.wrap(document)),
        ),
      ),
    onWillSave: (listener) =>
      toDisposer(
        vscode.workspace.onWillSaveTextDocument((event) => {
          event.waitUntil(listener(documents.wrap(event.document)));
        }),
      ),
    open: async (uri) =>
      documents.wrap(
        await vscode.workspace.openTextDocument(vscode.Uri.parse(uri)),
      ),
    rename: renameFile,
    text: (uri) =>
      vscode.workspace.textDocuments
        .find((document) => document.uri.toString() === uri)
        ?.getText(),
    onWillRename,
  };
}

const onWillRename: HostDocuments["onWillRename"] = (listener) =>
  toDisposer(
    vscode.workspace.onWillRenameFiles((event) => {
      const renames = event.files.map(({ oldUri, newUri }) => ({
        oldUri: oldUri.toString(),
        newUri: newUri.toString(),
      }));
      event.waitUntil(
        listener(renames).then((files) => {
          saveAfterRename(files);
          return workspaceEdit(files);
        }),
      );
    }),
  );

/**
 * Obsidian writes link updates straight to disk. Save the notes the update
 * edited once the rename lands, unless they already had unsaved changes, so
 * a closed editor's "Don't Save" can't leave a stale edited buffer behind.
 */
function saveAfterRename(files: readonly FileTextEdits[]): void {
  const uris = cleanEditedUris(files, (uri) =>
    vscode.workspace.textDocuments.some(
      (document) => document.uri.toString() === uri && document.isDirty,
    ),
  );
  if (uris.length === 0) {
    return;
  }
  const done = vscode.workspace.onDidRenameFiles(() => {
    done.dispose();
    for (const document of vscode.workspace.textDocuments) {
      if (uris.includes(document.uri.toString()) && document.isDirty) {
        void document.save();
      }
    }
  });
}

function workspaceEdit(files: readonly FileTextEdits[]): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  for (const file of files) {
    for (const change of file.edits) {
      edit.replace(
        vscode.Uri.parse(file.uri),
        new vscode.Range(
          change.start.line,
          change.start.col,
          change.end.line,
          change.end.col,
        ),
        change.text,
      );
    }
  }
  return edit;
}

export function toDisposer(disposable: vscode.Disposable): () => void {
  return () => disposable.dispose();
}
