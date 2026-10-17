import { createHash } from "node:crypto";
import * as path from "node:path";
import * as vscode from "vscode";

/** Let a file write settle before reloading the PDF. */
const RELOAD_DELAY_MS = 150;

/** One read of the file: its bytes and their hash. */
export interface PdfBytes {
  data: ArrayBuffer;
  sha256: string;
}

/**
 * The PDF file behind one editor: reads it, hashes it, and watches it for
 * changes.
 *
 * Invariant: `sha256` is the hash of the bytes most recently handed to the
 * viewer, and a slow read never replaces a newer one (each read has a
 * generation; only the latest may finish).
 */
export class PdfSource implements vscode.Disposable {
  sha256: string | undefined;
  private generation = 0;
  private readonly watcher: vscode.Disposable;

  constructor(
    readonly uri: vscode.Uri,
    onChangeOnDisk: () => void,
  ) {
    this.watcher = watchFile(uri, onChangeOnDisk);
  }

  /** Start a new read; resolves `undefined` if a newer read started meanwhile or it failed. */
  async read(): Promise<PdfBytes | undefined> {
    const generation = ++this.generation;
    let bytes: Uint8Array;
    try {
      bytes = await vscode.workspace.fs.readFile(this.uri);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Could not read ${displayPath(this.uri)}: ${String(error)}`,
      );
      return undefined;
    }
    if (generation !== this.generation) {
      return undefined;
    }
    this.sha256 = createHash("sha256").update(bytes).digest("hex");
    return { data: standaloneBuffer(bytes), sha256: this.sha256 };
  }

  dispose(): void {
    // A read in flight finishes into a stale generation and is dropped.
    this.generation++;
    this.watcher.dispose();
  }
}

function watchFile(uri: vscode.Uri, onChange: () => void): vscode.Disposable {
  if (uri.scheme !== "file") {
    return new vscode.Disposable(() => undefined);
  }
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      vscode.Uri.file(path.dirname(uri.fsPath)),
      path.basename(uri.fsPath),
    ),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reload = (): void => {
    clearTimeout(timer);
    timer = setTimeout(onChange, RELOAD_DELAY_MS);
  };
  const subscriptions = [
    watcher.onDidChange(reload),
    watcher.onDidCreate(reload),
  ];
  return new vscode.Disposable(() => {
    clearTimeout(timer);
    for (const subscription of subscriptions) {
      subscription.dispose();
    }
    watcher.dispose();
  });
}

/** The path agents should use: workspace-relative when possible. */
export function displayPath(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false).replaceAll("\\", "/");
}

/** The bytes as an ArrayBuffer of their own, which the webview can take over. */
function standaloneBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength &&
    bytes.buffer instanceof ArrayBuffer
    ? bytes.buffer
    : (bytes.slice().buffer as ArrayBuffer);
}
