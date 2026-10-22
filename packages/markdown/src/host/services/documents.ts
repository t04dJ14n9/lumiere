import { createHash } from "node:crypto";
import * as vscode from "vscode";
import { SourceCoordinates } from "../../shared/document/coordinates";
import { MARKDOWN_EDITOR } from "../../shared/editor-provider";
import type { FileTextEdits, HostDocuments } from "../../shared/host";
import { renameFile } from "../file-rename";
import { cleanEditedUris, partitionLinkUpdateFiles } from "../rename-save";
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
          // BH-014: onWill WorkspaceEdits often miss CustomTextEditor buffers.
          // Apply those ourselves after the rename. Closed notes stay in
          // waitUntil and are saved once the rename lands (Obsidian writes
          // link updates to disk without a manual Save).
          const openText = (uri: string) =>
            vscode.workspace.textDocuments
              .find((document) => document.uri.toString() === uri)
              ?.getText();
          const { open, closed } = partitionLinkUpdateFiles(
            files,
            lumiereOpenUris(),
            openText,
          );
          scheduleOpenEditorLinkUpdates(files, open);
          saveAfterRename(closed);
          return workspaceEdit(closed);
        }),
      );
    }),
  );

/** URIs that currently have a Lumière custom editor tab. */
function lumiereOpenUris(): Set<string> {
  const uris = new Set<string>();
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (
        input instanceof vscode.TabInputCustom &&
        input.viewType === MARKDOWN_EDITOR.viewType
      ) {
        uris.add(input.uri.toString());
      }
    }
  }
  return uris;
}

/**
 * Obsidian writes link updates straight to disk. Save the notes the waitUntil
 * edit dirtied once the rename lands, unless they already had unsaved changes,
 * so a closed editor's "Don't Save" can't leave a stale edited buffer behind.
 * Retries briefly: Show Preview applies the waitUntil edit after onDidRenameFiles.
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
    void saveCleanLinkUpdates(uris);
  });
}

const SAVE_ATTEMPTS = 40;
const SAVE_GAP_MS = 25;

async function saveCleanLinkUpdates(uris: readonly string[]): Promise<void> {
  const pending = new Set(uris);
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, SAVE_GAP_MS));
    }
    for (const uri of [...pending]) {
      const document = vscode.workspace.textDocuments.find(
        (open) => open.uri.toString() === uri,
      );
      if (document?.isDirty) {
        await document.save();
        pending.delete(uri);
      }
    }
    if (pending.size === 0) {
      return;
    }
  }
}

/**
 * After the rename lands, rewrite each Lumière-open note to the planned text
 * and save it when it had no unsaved edits of its own.
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
