import { Worker } from "node:worker_threads";
import { metadata } from "../markdown/metadata";
import type { NoteMetadata } from "../markdown/metadata";
import type { NoteParser } from "../plugins/vault/api";
import type { ParseRequest, ParseResponse } from "../workers/vault";

interface Pending {
  resolve: (value: NoteMetadata) => void;
  reject: (error: Error) => void;
}

/**
 * Parses notes in `dist/workers/vault.cjs`. If the worker cannot start or
 * exits, parsing continues in the extension host, so indexing never stops.
 */
export function createVaultParser(workerPath: string): {
  parse: NoteParser;
  dispose(): void;
} {
  const pending = new Map<number, Pending>();
  let next = 0;
  let worker: Worker | undefined = startWorker(workerPath, pending, () => {
    worker = undefined;
  });
  return {
    parse(text) {
      if (!worker) {
        return Promise.resolve(metadata(text));
      }
      const id = next++;
      const buffer = new TextEncoder().encode(text).buffer as ArrayBuffer;
      const request: ParseRequest = { id, text: buffer };
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker!.postMessage(request, [buffer]);
      });
    },
    dispose() {
      void worker?.terminate();
      worker = undefined;
    },
  };
}

function startWorker(
  path: string,
  pending: Map<number, Pending>,
  onExit: () => void,
): Worker | undefined {
  let worker: Worker;
  try {
    worker = new Worker(path);
  } catch {
    return undefined;
  }
  worker.unref();
  worker.on("message", (response: ParseResponse) => {
    const request = pending.get(response.id);
    pending.delete(response.id);
    if ("error" in response) {
      request?.reject(new Error(response.error));
    } else {
      request?.resolve(response.metadata);
    }
  });
  worker.on("exit", () => {
    onExit();
    for (const request of pending.values()) {
      request.reject(new Error("The indexing worker stopped"));
    }
    pending.clear();
  });
  return worker;
}
