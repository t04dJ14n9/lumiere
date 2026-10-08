import type { CodeProcessor, ProcessorResult } from "./api";
import { language, output } from "./protocol";
import { RpcError, type Cancellation } from "../../shared/rpc/lifecycle";
interface Entry {
  owner: string;
  processor: CodeProcessor;
}
let nextEpoch = 0;
export class ProcessorRegistry {
  readonly epoch = ++nextEpoch;
  private readonly entries = new Map<string, Entry>();
  private live = true;
  revision = 0;
  constructor(private readonly changed: () => void) {}
  register(owner: string, processor: CodeProcessor): () => void {
    if (!this.live) {
      throw new RpcError("PluginDisabled", "Code processors stopped");
    }
    if (typeof processor.render !== "function") {
      throw new RpcError(
        "InvalidArgument",
        "A contribution callback is required",
      );
    }
    const id = language.parse(processor.language).toLowerCase();
    if (this.entries.has(id)) {
      throw new RpcError(
        "DuplicateContribution",
        "Code language already has a processor",
      );
    }
    if (this.entries.size >= 256) {
      throw new RpcError("InvalidArgument", "Too many code processors");
    }
    const entry = { owner, processor };
    this.entries.set(id, entry);
    this.invalidate();
    return () => {
      if (this.entries.get(id) === entry) {
        this.entries.delete(id);
        this.invalidate();
      }
    };
  }
  snapshot(editorId?: string) {
    return {
      epoch: this.epoch,
      revision: this.revision,
      languages: [...this.entries]
        .filter(
          ([, entry]) =>
            !editorId || entry.processor.isAvailable?.(editorId) !== false,
        )
        .map(([language]) => language)
        .sort(),
    };
  }
  async render(
    request: {
      language: string;
      source: string;
      uri: string;
      sourceLine: number;
      revision: number;
      epoch: number;
      editorId: string;
    },
    token: Cancellation,
  ): Promise<ProcessorResult> {
    const entry = this.entries.get(request.language);
    if (
      !this.live ||
      !entry ||
      entry.processor.isAvailable?.(request.editorId) === false
    ) {
      throw new RpcError("PluginDisabled", "Code processor is unavailable");
    }
    if (request.revision !== this.revision || request.epoch !== this.epoch) {
      throw new RpcError("SourceChanged", "Code processors changed");
    }
    if (token.cancelled) {
      throw new RpcError("Cancelled", "Code rendering cancelled");
    }
    const result = await entry.processor.render(
      request.source,
      { uri: request.uri, sourceLine: request.sourceLine },
      token,
    );
    if (
      token.cancelled ||
      entry.processor.isAvailable?.(request.editorId) === false ||
      !this.live ||
      this.entries.get(request.language) !== entry ||
      request.revision !== this.revision
    ) {
      throw new RpcError(
        "Cancelled",
        "Code processor stopped before rendering finished",
      );
    }
    return output.parse(result);
  }
  clearOwner(owner: string): void {
    if (!this.live) {
      return;
    }
    for (const [id, entry] of this.entries) {
      if (entry.owner === owner) {
        this.entries.delete(id);
      }
    }
    this.invalidate();
  }
  private invalidate(): void {
    this.revision++;
    this.changed();
  }
  dispose(): void {
    this.live = false;
    this.entries.clear();
  }
}
