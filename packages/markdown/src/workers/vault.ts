import { parentPort } from "node:worker_threads";
import { metadata } from "../markdown/metadata";

/**
 * The vault indexing worker: parses one note's text into metadata, so a large
 * vault never blocks the extension host. The text arrives as a transferred
 * buffer; the metadata goes back by structured clone, which keeps its Maps.
 */
export interface ParseRequest {
  id: number;
  text: ArrayBuffer;
}

export type ParseResponse =
  | { id: number; metadata: ReturnType<typeof metadata> }
  | { id: number; error: string };

parentPort?.on("message", ({ id, text }: ParseRequest) => {
  let response: ParseResponse;
  try {
    response = { id, metadata: metadata(new TextDecoder().decode(text)) };
  } catch (error) {
    response = { id, error: String(error) };
  }
  parentPort!.postMessage(response);
});
