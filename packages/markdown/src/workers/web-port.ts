import type { WorkerPort } from "../shared/workers";

/**
 * The host, as a web worker sees it, once the host's first message (the start
 * data, `{ start }`) has arrived: browsers have no `workerData`.
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
      // Serving starts within this event, so the next message finds its listener.
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
