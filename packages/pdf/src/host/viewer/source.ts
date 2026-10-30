import { createHash } from "node:crypto";
import type { PdfFiles } from "../../shared/host";

/** Let a file write settle before reloading the PDF. */
const RELOAD_DELAY_MS = 150;

/** One read of the file: its bytes and their hash. */
export interface PdfBytes {
  data: ArrayBuffer;
  sha256: string;
}

export interface SourceEvents {
  /** The file changed on disk and has settled. */
  changed(): void;
  /** A read failed; the message says which file and why. */
  failed(message: string): void;
}

/**
 * The PDF file behind one editor: reads it, hashes it, and watches it for
 * changes.
 *
 * Invariant: `sha256` is the hash of the bytes most recently handed to the
 * viewer, and a slow read never replaces a newer one (each read has a
 * generation; only the latest may finish).
 */
export class PdfSource {
  sha256: string | undefined;
  private expectedWrite: string | undefined;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly stopWatching: () => void;

  constructor(
    readonly uri: string,
    private readonly files: PdfFiles,
    private readonly events: SourceEvents,
  ) {
    this.stopWatching = files.watch(uri, () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(
        () => void this.onWatchedChange(),
        RELOAD_DELAY_MS,
      );
    });
  }

  expectWrite(sha256: string): void {
    this.expectedWrite = sha256;
  }

  async diskMatchesBase(): Promise<boolean> {
    if (!this.sha256 || !this.files.hash) {
      return true;
    }
    try {
      return (await this.files.hash(this.uri)) === this.sha256;
    } catch {
      return false;
    }
  }

  acceptWrite(sha256: string): void {
    this.sha256 = sha256;
    this.expectedWrite = sha256;
  }

  /** Start a new read; resolves `undefined` if a newer read started meanwhile or it failed. */
  async read(): Promise<PdfBytes | undefined> {
    const generation = ++this.generation;
    let bytes: Uint8Array;
    try {
      bytes = await this.files.read(this.uri);
    } catch (error) {
      this.events.failed(
        `Could not read ${this.files.displayPath(this.uri)}: ${String(error)}`,
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
    clearTimeout(this.timer);
    this.stopWatching();
  }

  private async onWatchedChange(): Promise<void> {
    if (this.expectedWrite && this.files.hash) {
      try {
        const disk = await this.files.hash(this.uri);
        if (disk === this.expectedWrite) {
          // Keep expectedWrite: atomic rename often fires create+change, and
          // clearing after the first event lets the second reload the viewer
          // (wiping EmbedPDF History so Undo Annotation no-ops).
          this.sha256 = disk;
          return;
        }
      } catch {
        // Fall through to a normal reload.
      }
    }
    this.events.changed();
  }
}

/** The bytes as an ArrayBuffer of their own, which the webview can take over. */
function standaloneBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength &&
    bytes.buffer instanceof ArrayBuffer
    ? bytes.buffer
    : (bytes.slice().buffer as ArrayBuffer);
}
