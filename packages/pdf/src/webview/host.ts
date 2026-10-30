/**
 * The viewer's side of the conversation with the extension. See
 * `shared/messages.ts` for the message flow.
 */
import type { HostMessage, ViewerPatch } from "../shared/messages";
import { createOutbox, type OutgoingMessage } from "./outbox";
import { prepareReadingPosition } from "./reading-position";
import { HostInbox } from "../shared/host-inbox";
import { rememberAnnotationLoad } from "./annotation-load-state";
import { createLoadReceiver, fetchPdfBytes } from "./load";

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

type NavigationMessage = Exclude<HostMessage, { type: "load" }>;

const vscode = acquireVsCodeApi();
const outbox = createOutbox((message) => vscode.postMessage(message));
const inbox = new HostInbox<NavigationMessage>();

export function currentHostGeneration(): number {
  return inbox.generation;
}

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
  generation: number,
): () => void {
  return inbox.listen(next, generation);
}

/**
 * Start the conversation. `onLoad` receives each PDF the host sends. A load
 * retires the previous viewer's inbox at once, even while its bytes are
 * still on their way, so navigation sent after it waits for the new viewer.
 */
export function connectToHost(onLoad: (data: ArrayBuffer) => void): void {
  const receiveBytes = createLoadReceiver(
    {
      open: onLoad,
      fail: (message) => postToHost({ type: "error", message }),
    },
    fetchPdfBytes,
  );
  window.addEventListener(
    "message",
    (event: MessageEvent<HostMessage | undefined>) => {
      const message = event.data;
      if (!message || typeof message !== "object") {
        return;
      }
      if (message.type === "load") {
        inbox.beginLoad();
        outbox.loaded(message.load);
        rememberAnnotationLoad(message.load, message.sha256);
        prepareReadingPosition(message.settings, message.position);
        receiveBytes(message);
      } else {
        inbox.receive(message);
      }
    },
  );
  postToHost({ type: "ready" });
}
