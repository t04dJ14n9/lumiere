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
    const { sha256 } = await this.files.writeAtomic(
      this.fileUri,
      new Uint8Array(data),
    );
    this.source.acceptWrite(sha256);
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
    this.dirty = "saving";
    try {
      const { sha256 } = await this.files.writeAtomic(
        this.fileUri,
        new Uint8Array(message.data),
      );
      this.source.acceptWrite(sha256);
      this.dirty = "clean";
      this.deps.post({
        type: "annotationSaveResult",
        load: message.load,
        ok: true,
        sha256,
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
