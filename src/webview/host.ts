/**
 * The viewer's side of the conversation with the extension. See
 * `shared/messages.ts` for the message flow.
 */
import type { HostMessage, ViewerPatch } from "../shared/messages";
import { createOutbox, type OutgoingMessage } from "./outbox";
import { prepareReadingPosition } from "./reading-position";

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

type NavigationMessage = Exclude<HostMessage, { type: "load" }>;

const vscode = acquireVsCodeApi();
const outbox = createOutbox((message) => vscode.postMessage(message));
const queued: NavigationMessage[] = [];
let listener: ((message: NavigationMessage) => void) | undefined;

/** Send a message (after any pending state report). */
export function postToHost(message: OutgoingMessage): void {
  outbox.post(message);
}

/** Report a change in the viewer's state; changes are batched per frame. */
export function reportToHost(patch: ViewerPatch): void {
  outbox.report(patch);
}

/**
 * Receive navigation messages in the mounted viewer. Messages that arrive
 * while the PDF is still opening are delivered once a listener attaches.
 */
export function listenToHost(
  next: (message: NavigationMessage) => void,
): () => void {
  listener = next;
  for (const message of queued.splice(0)) next(message);
  return () => {
    if (listener === next) listener = undefined;
  };
}

/** Start the conversation. `onLoad` receives each PDF the host sends. */
export function connectToHost(onLoad: (data: ArrayBuffer) => void): void {
  window.addEventListener(
    "message",
    (event: MessageEvent<HostMessage | undefined>) => {
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "load") {
        const data = asArrayBuffer(message.data);
        outbox.loaded();
        prepareReadingPosition(message.settings, message.position);
        if (data) onLoad(data);
        else
          postToHost({
            type: "error",
            message: "The PDF data from the extension is not readable.",
          });
      } else if (listener) {
        listener(message);
      } else {
        queued.push(message);
      }
    },
  );
  postToHost({ type: "ready" });
}

function asArrayBuffer(value: unknown): ArrayBuffer | undefined {
  if (value instanceof ArrayBuffer) return value;
  if (!ArrayBuffer.isView(value)) return undefined;
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}
