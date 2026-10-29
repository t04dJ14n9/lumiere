/**
 * The bytes of each `load` (see `PdfDelivery` in shared/messages.ts): in the
 * message, as VS Code sends them, or fetched from the host's URL. Only the
 * newest load is opened: a fetch that a later load overtook is dropped.
 */
import type { HostMessage } from "../shared/messages";

type LoadMessage = Extract<HostMessage, { type: "load" }>;

export interface LoadTarget {
  /** Open the PDF. */
  open(data: ArrayBuffer): void;
  /** The bytes could not be read; the message says why. */
  fail(message: string): void;
}

/** Receives load messages; `fetchBytes` fetches a URL's body. */
export function createLoadReceiver(
  target: LoadTarget,
  fetchBytes: (url: string) => Promise<ArrayBuffer>,
): (message: LoadMessage) => void {
  let latest = 0;
  return (message) => {
    const load = ++latest;
    if ("url" in message) {
      fetchBytes(message.url).then(
        (data) => {
          if (load === latest) {
            target.open(data);
          }
        },
        (error: unknown) => {
          if (load === latest) {
            target.fail(`The PDF could not be downloaded: ${String(error)}`);
          }
        },
      );
      return;
    }
    const data = asArrayBuffer(message.data);
    if (data) {
      target.open(data);
    } else {
      target.fail("The PDF data from the extension is not readable.");
    }
  };
}

/** A same-origin fetch of the bytes; the host's cookie authenticates it. */
export async function fetchPdfBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim());
  }
  return response.arrayBuffer();
}

function asArrayBuffer(value: unknown): ArrayBuffer | undefined {
  if (value instanceof ArrayBuffer) {
    return value;
  }
  if (!ArrayBuffer.isView(value)) {
    return undefined;
  }
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}
