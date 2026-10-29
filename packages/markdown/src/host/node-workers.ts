import * as path from "node:path";
import { Worker } from "node:worker_threads";
import type { WorkerChannel, WorkerLauncher } from "../shared/workers";

/** Worker threads running the CommonJS worker builds in `directory` (`<name>.cjs`). */
export function nodeWorkerLauncher(directory: string): WorkerLauncher {
  return {
    start(name, options = {}) {
      const worker = new Worker(path.join(directory, `${name}.cjs`), {
        ...(options.data === undefined ? {} : { workerData: options.data }),
        ...(options.memoryLimitMb === undefined
          ? {}
          : {
              resourceLimits: { maxOldGenerationSizeMb: options.memoryLimitMb },
            }),
      });
      return workerChannel(worker);
    },
  };
}

function workerChannel(worker: Worker): WorkerChannel {
  return {
    post: (message, transfer) => worker.postMessage(message, transfer),
    onMessage: (listener) => void worker.on("message", listener),
    onError: (listener) => void worker.on("error", listener),
    onExit: (listener) => void worker.on("exit", listener),
    unref: () => worker.unref(),
    async terminate() {
      await worker.terminate();
    },
  };
}
