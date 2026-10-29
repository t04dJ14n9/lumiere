import { metadata } from "../markdown/metadata";
import type { WorkerPort } from "../shared/workers";

/**
 * The vault indexing worker: parses one note's text into metadata, so a large
 * vault never blocks the host. The text arrives as a transferred buffer; the
 * metadata goes back by structured clone, which keeps its Maps.
 */
export interface ParseRequest {
  id: number;
  text: ArrayBuffer;
}

export type ParseResponse =
  | { id: number; metadata: ReturnType<typeof metadata> }
  | { id: number; error: string };

export function serveVault(port: WorkerPort): void {
  port.onMessage((message) => {
    const { id, text } = message as ParseRequest;
    let response: ParseResponse;
    try {
      response = { id, metadata: metadata(new TextDecoder().decode(text)) };
    } catch (error) {
      response = { id, error: String(error) };
    }
    port.post(response);
  });
}
