import { parentPort, workerData } from "node:worker_threads";
import type { WorkerPort } from "../shared/workers";

/** The host, as a worker thread sees it; undefined outside a worker thread. */
export function nodeWorkerPort(): WorkerPort | undefined {
  const port = parentPort;
  if (!port) {
    return undefined;
  }
  return {
    data: workerData,
    post: (message) => port.postMessage(message),
    onMessage: (listener) => void port.on("message", listener),
    close: () => port.close(),
  };
}
