import * as vscode from "vscode";
import type { HostDocument } from "../../shared/host";

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
