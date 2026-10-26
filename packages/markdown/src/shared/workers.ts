/**
 * Workers the plugins' host half starts: Node worker threads in VS Code and
 * host-node, web workers in a browser. A caller names a built script; the
 * host knows where its build is and how to start it.
 */

/** A built worker script, by name (`dist/workers/<name>`). */
export type WorkerName = "vault" | "search";

export interface WorkerOptions {
  /** Delivered before any message (Node's `workerData`). */
  readonly data?: unknown;
  /**
   * A heap cap in megabytes, where the host has one (Node). Elsewhere the
   * caller's own timeouts are the only limit.
   */
  readonly memoryLimitMb?: number;
}

/** One running worker, as the host sees it. */
export interface WorkerChannel {
  /** Send a message; `transfer` moves those buffers instead of copying them. */
  post(message: unknown, transfer?: readonly ArrayBuffer[]): void;
  onMessage(listener: (message: unknown) => void): void;
  onError(listener: (error: Error) => void): void;
  /** The worker stopped: it exited, crashed or was terminated. */
  onExit(listener: (code: number) => void): void;
  /** Do not keep the host process alive for this worker (Node's `unref`). */
  unref(): void;
  terminate(): Promise<void>;
}

export interface WorkerLauncher {
  /** Start a worker; throws when it cannot even be created. */
  start(name: WorkerName, options?: WorkerOptions): WorkerChannel;
}

/** The host, as a worker script sees it. */
export interface WorkerPort {
  /** What the host passed as `WorkerOptions.data`. */
  readonly data: unknown;
  post(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
  /** Stop listening, so the worker can end. */
  close(): void;
}
