import { createHash } from "node:crypto";
import type { HostMessage, ViewerMessage } from "../../shared/messages";
import type { PdfFiles } from "../../shared/host";
import type { PdfSource } from "./source";

export type AnnotationDirty = "clean" | "saving" | "failed";

/** Collaborator for in-place annotation overwrite on the open PDF. */
export class AnnotationSave {
  dirty: AnnotationDirty = "clean";
  lastBytes: ArrayBuffer | undefined;

  constructor(
    private readonly fileUri: string,
    private readonly files: PdfFiles,
    private readonly source: PdfSource,
    private readonly deps: {
      isCurrentLoad: (load: number) => boolean;
      post: (message: HostMessage) => void;
      error: (message: string) => void;
      conflict: (payload: { data: ArrayBuffer; load: number }) => void;
      failed: (message: string) => void;
    },
  ) {}

  markFailed(): void {
    this.dirty = "failed";
  }

  async keepMine(data: ArrayBuffer, load: number): Promise<void> {
    if (!this.deps.isCurrentLoad(load) || !this.files.writeAtomic) {
      return;
    }
    const bytes = new Uint8Array(data);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    this.source.expectWrite(sha256);
    const written = await this.files.writeAtomic(this.fileUri, bytes);
    this.source.acceptWrite(written.sha256);
    this.dirty = "clean";
    this.deps.post({ type: "annotationSaveResult", load, ok: true, sha256 });
  }

  async save(
    message: Extract<ViewerMessage, { type: "annotationSave" }>,
  ): Promise<void> {
    if (!this.deps.isCurrentLoad(message.load)) {
      return;
    }
    this.lastBytes = message.data;
    if (message.baseSha256 !== this.source.sha256) {
      this.reportConflict(
        message,
        "The PDF changed since this editor loaded it.",
      );
      return;
    }
    if (!this.files.writeAtomic) {
      this.dirty = "failed";
      this.deps.error("This host cannot overwrite PDF files in place.");
      this.deps.post({
        type: "annotationSaveResult",
        load: message.load,
        ok: false,
        reason: "error",
        message: "writeAtomic is unavailable",
      });
      return;
    }
    if (!(await this.source.diskMatchesBase())) {
      this.reportConflict(message, "The PDF was modified on disk.");
      return;
    }
    const bytes = new Uint8Array(message.data);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    this.source.expectWrite(sha256);
    this.dirty = "saving";
    try {
      const written = await this.files.writeAtomic(this.fileUri, bytes);
      this.source.acceptWrite(written.sha256);
      this.dirty = "clean";
      this.deps.post({
        type: "annotationSaveResult",
        load: message.load,
        ok: true,
        sha256: written.sha256,
      });
    } catch (error) {
      this.dirty = "failed";
      const text = error instanceof Error ? error.message : String(error);
      this.deps.error(`Could not save PDF annotations: ${text}`);
      this.deps.failed(text);
      this.deps.post({
        type: "annotationSaveResult",
        load: message.load,
        ok: false,
        reason: "error",
        message: text,
      });
    }
  }

  private reportConflict(
    message: Extract<ViewerMessage, { type: "annotationSave" }>,
    text: string,
  ): void {
    this.deps.conflict({ data: message.data, load: message.load });
    this.deps.post({
      type: "annotationSaveResult",
      load: message.load,
      ok: false,
      reason: "conflict",
      message: text,
    });
  }
}
