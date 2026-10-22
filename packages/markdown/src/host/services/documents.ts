import { createHash } from "node:crypto";
import * as vscode from "vscode";
import { SourceCoordinates } from "../../shared/document/coordinates";
import type { FileTextEdits, HostDocuments } from "../../shared/host";
import { renameFile } from "../file-rename";
import { cleanEditedUris, expectedOpenEditorText } from "../rename-save";
import type { NativeDocuments } from "./native-documents";

/** VS Code's text documents, wrapped as `HostDocument`s by `documents`. */
export function createHostDocuments(documents: NativeDocuments): HostDocuments {
  return {
    fingerprint: (text) => createHash("sha256").update(text).digest("hex"),
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
          // BH-014: WorkspaceEdits returned from onWillRename are applied by
          // VS Code's file-operation participant (often behind Show Preview).
          // Open CustomTextEditor buffers frequently never receive that edit,
          // and saving on onDidRenameFiles races the participant. Apply open
          // notes ourselves after the rename; keep closed notes in waitUntil
          // so they still rewrite on disk with the rename.
          const openText = (uri: string) =>
            vscode.workspace.textDocuments
              .find((document) => document.uri.toString() === uri)
              ?.getText();
          const open = expectedOpenEditorText(files, openText);
          const closed = files.filter((file) => !open.has(file.uri));
          scheduleOpenEditorLinkUpdates(files, open);
          return workspaceEdit(closed);
        }),
      );
    }),
  );

/**
 * After the rename lands, rewrite each open note to the planned text and save
 * it when it had no unsaved edits of its own (Obsidian writes link updates to
 * disk).
 */
function scheduleOpenEditorLinkUpdates(
  files: readonly FileTextEdits[],
  expected: ReadonlyMap<string, string>,
): void {
  if (expected.size === 0) {
    return;
  }
  const clean = new Set(
    cleanEditedUris(
      files.filter((file) => expected.has(file.uri)),
      (uri) =>
        vscode.workspace.textDocuments.some(
          (document) => document.uri.toString() === uri && document.isDirty,
        ),
    ),
  );
  const done = vscode.workspace.onDidRenameFiles(() => {
    done.dispose();
    void applyOpenEditorLinkUpdates(files, expected, clean);
  });
}

async function applyOpenEditorLinkUpdates(
  files: readonly FileTextEdits[],
  expected: ReadonlyMap<string, string>,
  clean: ReadonlySet<string>,
): Promise<void> {
  for (const [uri, want] of expected) {
    const document = vscode.workspace.textDocuments.find(
      (open) => open.uri.toString() === uri,
    );
    if (!document) {
      continue;
    }
    if (document.getText() === want) {
      if (clean.has(uri) && document.isDirty) {
        await document.save();
      }
      continue;
    }
    const file = files.find((entry) => entry.uri === uri);
    if (!file || !(await vscode.workspace.applyEdit(workspaceEdit([file])))) {
      continue;
    }
    if (clean.has(uri)) {
      await document.save();
    }
  }
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
