/**
 * The viewer's side of the conversation with the extension. See
 * `shared/messages.ts` for the message flow.
 */
import type { HostMessage, ViewerMessage } from '../shared/messages';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

type NavigationMessage = Exclude<HostMessage, { type: 'load' }>;

const vscode = acquireVsCodeApi();
const queued: NavigationMessage[] = [];
let listener: ((message: NavigationMessage) => void) | undefined;

export function postToHost(message: ViewerMessage): void {
  vscode.postMessage(message);
}

/**
 * Receive navigation messages in the mounted viewer. Messages that arrive
 * while the PDF is still opening are delivered once a listener attaches.
 */
export function listenToHost(next: (message: NavigationMessage) => void): () => void {
  listener = next;
  for (const message of queued.splice(0)) next(message);
  return () => {
    if (listener === next) listener = undefined;
  };
}

/** Start the conversation. `onLoad` receives each PDF the host sends. */
export function connectToHost(onLoad: (data: ArrayBuffer) => void): void {
  window.addEventListener('message', (event: MessageEvent<HostMessage | undefined>) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'load') {
      const data = asArrayBuffer(message.data);
      if (data) onLoad(data);
      else postToHost({ type: 'error', message: 'The PDF data from the extension is not readable.' });
    } else if (listener) {
      listener(message);
    } else {
      queued.push(message);
    }
  });
  postToHost({ type: 'ready' });
}

function asArrayBuffer(value: unknown): ArrayBuffer | undefined {
  if (value instanceof ArrayBuffer) return value;
  if (!ArrayBuffer.isView(value)) return undefined;
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}
