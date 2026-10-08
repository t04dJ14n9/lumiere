import { Worker } from "node:worker_threads";
import type { SearchDocument } from "../../markdown/search/evaluate";
import type { Cancellation } from "../../shared/rpc/lifecycle";
import { RpcError } from "../../shared/rpc/lifecycle";
import { startup, submission, workerReply } from "./worker-protocol";
interface Pending {
  resolve(value: boolean): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}
export interface SearchEvaluator {
  ready: Promise<void>;
  includesFiles: boolean;
  stopped: boolean;
  matches(document: SearchDocument): Promise<boolean>;
  dispose(): Promise<void>;
}
/** One query per worker: a stuck regex can be terminated without blocking the host. */
export class SearchWorker implements SearchEvaluator {
  readonly ready: Promise<void>;
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private sequence = 0;
  private closed?: Error;
  private termination?: Promise<unknown>;
  private readonly resolveReady: () => void;
  private readonly rejectReady: (error: Error) => void;
  private readonly startupTimer: ReturnType<typeof setTimeout>;
  private stopCancellation: () => void = () => {};
  includesFiles = false;
  constructor(
    path: string,
    query: string,
    private readonly options: {
      token?: Cancellation;
      timeoutMs?: number;
      startupMs?: number;
    } = {},
  ) {
    if (options.token?.cancelled) {
      throw new RpcError("Cancelled", "Search cancelled");
    }
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    this.ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    this.resolveReady = resolveReady;
    this.rejectReady = rejectReady;
    void this.ready.catch(() => {});
    this.worker = new Worker(path, {
      workerData: startup.parse({ query }),
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    this.startupTimer = setTimeout(
      () => this.fail(new Error("Search worker startup timed out")),
      options.startupMs ?? 15000,
    );
    this.worker.on("message", (message: unknown) => this.receive(message));
    this.worker.on("error", (error) => this.fail(error));
    this.worker.on("exit", (code) =>
      this.fail(new Error(`Search worker exited (${code})`)),
    );
    this.stopCancellation =
      options.token?.onCancel(() =>
        this.fail(new RpcError("Cancelled", "Search cancelled")),
      ) ?? (() => {});
  }
  get stopped(): boolean {
    return this.closed !== undefined;
  }
  async matches(document: SearchDocument): Promise<boolean> {
    await this.ready;
    if (this.closed) {
      throw this.closed;
    }
    const request = submission.parse({ id: ++this.sequence, document });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.fail(
            new Error(`Search evaluation timed out for ${document.path}`),
          ),
        this.options.timeoutMs ?? 5000,
      );
      this.pending.set(request.id, { resolve, reject, timer });
      try {
        this.worker.postMessage(request);
      } catch (error) {
        this.fail(new Error(String(error)));
      }
    });
  }
  private receive(value: unknown): void {
    if (this.closed) {
      return;
    }
    try {
      const reply = workerReply(value);
      if (reply.type === "error") {
        this.fail(new Error(reply.message));
        return;
      }
      if (reply.type === "ready") {
        this.includesFiles = reply.files;
        clearTimeout(this.startupTimer);
        this.resolveReady();
        return;
      }
      const request = this.pending.get(reply.id);
      if (!request) {
        return;
      }
      this.pending.delete(reply.id);
      clearTimeout(request.timer);
      if (reply.type === "result") {
        request.resolve(reply.matched);
      } else {
        request.reject(new Error(reply.message));
      }
    } catch (error) {
      this.fail(new Error(String(error)));
    }
  }
  private fail(error: Error): void {
    if (this.closed) {
      return;
    }
    this.closed = error;
    clearTimeout(this.startupTimer);
    this.stopCancellation();
    this.rejectReady(error);
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    this.termination = this.worker.terminate();
    void this.termination.catch(() => {});
  }
  async dispose(): Promise<void> {
    this.fail(new RpcError("Cancelled", "Search cancelled"));
    await this.termination;
  }
}
