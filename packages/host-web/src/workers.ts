/**
 * The plugins' workers in a browser: web workers from the built `*.web.js`
 * scripts (packages/markdown/src/workers/*.web.ts). A web worker has no start
 * data, so the first message carries it (`{ start }`, web-port.ts).
 */
import type {
  WorkerChannel,
  WorkerLauncher,
  WorkerName,
} from "@workshop/markdown/portable";

export function webWorkerLauncher(
  scriptUrl: (name: WorkerName) => string,
): WorkerLauncher {
  return {
    start(name, options): WorkerChannel {
      const worker = new Worker(scriptUrl(name));
      worker.postMessage({ start: options?.data });
      const exits = new Set<(code: number) => void>();
      return {
        post: (message, transfer) =>
          worker.postMessage(message, transfer ? [...transfer] : []),
        onMessage: (listener) =>
          worker.addEventListener("message", (event) => listener(event.data)),
        onError: (listener) =>
          worker.addEventListener("error", (event) =>
            listener(new Error(event.message)),
          ),
        // A browser reports no exit: a worker ends only when terminated here.
        onExit: (listener) => void exits.add(listener),
        unref: () => {},
        async terminate() {
          worker.terminate();
          for (const listener of exits) {
            listener(0);
          }
        },
      };
    },
  };
}
