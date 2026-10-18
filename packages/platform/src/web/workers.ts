import type { WorkerChannel, WorkerLauncher, WorkerPort } from "../workers";

/**
 * Web workers running the classic-script worker bundles at `directory` (a
 * URL; `<name>.js`). In VS Code's web extension host `Worker` is VS Code's
 * shim, which starts the script through `importScripts`, so the bundles
 * must not be ES modules. Browsers have no `workerData` or heap caps: the
 * start data is the first message, and the caller's timeouts are the only
 * limit.
 */
export function webWorkerLauncher(directory: string): WorkerLauncher {
  return {
    start(name, options = {}) {
      const worker = new Worker(`${directory}/${name}.js`, {
        name: `workshop-${name}`,
      });
      worker.postMessage({ start: options.data });
      return workerChannel(worker);
    },
  };
}

function workerChannel(worker: Worker): WorkerChannel {
  const exits = new Set<(code: number) => void>();
  let running = true;
  const stop = (code: number) => {
    if (running) {
      running = false;
      worker.terminate();
      for (const listener of exits) {
        listener(code);
      }
    }
  };
  // A web worker reports a failure but never exits by itself: end it, as a
  // Node worker thread exits after an uncaught error, so callers that wait
  // for the exit (to fall back or to fail pending requests) are not left
  // waiting.
  worker.addEventListener("error", (event) => {
    event.preventDefault();
    queueMicrotask(() => stop(1));
  });
  return {
    post: (message, transfer) =>
      worker.postMessage(message, [...(transfer ?? [])]),
    onMessage: (listener) =>
      worker.addEventListener("message", (event) => listener(event.data)),
    onError: (listener) =>
      worker.addEventListener("error", (event) =>
        listener(new Error(event.message || "The worker failed")),
      ),
    onExit: (listener) => void exits.add(listener),
    unref: () => {},
    async terminate() {
      stop(1);
    },
  };
}

/**
 * The host as a web worker sees it, once the host's first message (the
 * start data) has arrived. For the worker bundles' browser entry points.
 */
export function startWebWorker(
  scope: DedicatedWorkerGlobalScope,
  serve: (port: WorkerPort) => void,
): void {
  const listeners = new Set<(message: unknown) => void>();
  const receive = (event: MessageEvent) => {
    for (const listener of listeners) {
      listener(event.data);
    }
  };
  scope.addEventListener(
    "message",
    (event: MessageEvent<{ start: unknown }>) => {
      scope.addEventListener("message", receive);
      serve({
        data: event.data.start,
        post: (message) => scope.postMessage(message),
        onMessage: (listener) => void listeners.add(listener),
        close: () => scope.removeEventListener("message", receive),
      });
    },
    { once: true },
  );
}
